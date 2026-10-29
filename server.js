const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const { run, get, all, ready } = require("./src/db/database");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

app.use(express.json({ limit: "25kb" }));

// Serve CSS, browser JavaScript, images, and other public assets.
app.use(express.static(path.join(__dirname, "public")));

// Helpers for safer password and session handling.
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64);
    return salt + ":" + hash.toString("hex");
}

function verifyPassword(password, storedHash) {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;

    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");

    return actual.length === expected.length &&
        crypto.timingSafeEqual(actual, expected);
}

function hashToken(token) {
    return crypto.createHash("sha256")
        .update(token)
        .digest("hex");
}

function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function requireLogin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "You must log in first."
        });
    }
    next();
}

// Wait for the database and identify the signed-in user.
app.use(asyncRoute(async (req, res, next) => {
    await ready;

    const cookie = (req.headers.cookie || "")
        .split(";")
        .map(part => part.trim())
        .find(part => part.startsWith("p4p_session="));

    if (cookie) {
        const token = cookie.substring("p4p_session=".length);

        if (/^[a-f0-9]{64}$/.test(token)) {
            req.user = await get(`
                SELECT users.id, users.username, users.email
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ?
                  AND sessions.expires_at > ?
            `, [hashToken(token), Date.now()]);

            req.sessionToken = token;
        }
    }

    next();
}));

// Reject cross-origin requests that modify data.
app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        return next();
    }

    const origin = req.get("origin");

    if (origin) {
        try {
            if (new URL(origin).host !== req.get("host")) {
                return res.status(403).json({
                    error: "Invalid request origin."
                });
            }
        } catch {
            return res.status(403).json({
                error: "Invalid request origin."
            });
        }
    }

    next();
});

// Create a login session.
async function createSession(res, user) {
    const token = crypto.randomBytes(32).toString("hex");

    await run(`
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
    `, [
        user.id,
        hashToken(token),
        Date.now() + SESSION_DURATION
    ]);

    res.cookie("p4p_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_DURATION,
        path: "/"
    });

    res.json({
        user: {
            id: user.id,
            username: user.username,
            email: user.email
        }
    });
}

// ------------------------------
// AUTHENTICATION
// ------------------------------

// Register a user.
app.post("/api/auth/signup", asyncRoute(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        return res.status(400).json({
            error: "Username must contain 3-24 letters, numbers or underscores."
        });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({
            error: "Enter a valid email address."
        });
    }

    if (password.length < 10 || password.length > 128) {
        return res.status(400).json({
            error: "Password must be 10-128 characters."
        });
    }

    try {
        const result = await run(`
            INSERT INTO users (username, email, password_hash)
            VALUES (?, ?, ?)
        `, [username, email, hashPassword(password)]);

        res.status(201);
        await createSession(res, {
            id: result.id,
            username,
            email
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT") {
            return res.status(409).json({
                error: "Username or email already exists."
            });
        }
        throw error;
    }
}));

// Log in with username or email.
app.post("/api/auth/login", asyncRoute(async (req, res) => {
    const identity = String(req.body.identity || "").trim();
    const password = String(req.body.password || "");

    const user = await get(`
        SELECT * FROM users
        WHERE username = ? OR email = ?
    `, [identity, identity]);

    if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({
            error: "Incorrect username/email or password."
        });
    }

    await createSession(res, user);
}));

// Log out.
app.post("/api/auth/logout", asyncRoute(async (req, res) => {
    if (req.sessionToken) {
        await run(`
            DELETE FROM sessions WHERE token_hash = ?
        `, [hashToken(req.sessionToken)]);
    }

    res.clearCookie("p4p_session", { path: "/" });
    res.json({ ok: true });
}));

// Return the current account.
app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user || null });
});

// ------------------------------
// LEAGUES
// ------------------------------

// Get leagues belonging to the current user.
app.get("/api/leagues", requireLogin, asyncRoute(async (req, res) => {
    const leagues = await all(`
        SELECT
            l.id, l.name, l.invite_code,
            l.owner_id, l.created_at,
            (SELECT COUNT(*)
             FROM memberships m
             WHERE m.league_id = l.id) AS member_count
        FROM leagues l
        JOIN memberships m ON m.league_id = l.id
        WHERE m.user_id = ?
        ORDER BY l.id DESC
    `, [req.user.id]);

    res.json({ leagues });
}));

// Add a member and automatically create their roster.
async function addMember(userId, leagueId) {
    await run(`
        INSERT INTO memberships (user_id, league_id)
        VALUES (?, ?)
    `, [userId, leagueId]);

    await run(`
        INSERT INTO rosters (user_id, league_id)
        VALUES (?, ?)
    `, [userId, leagueId]);
}

// Create a league.
app.post("/api/leagues", requireLogin, asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (name.length < 3 || name.length > 60) {
        return res.status(400).json({
            error: "League name must be 3-60 characters."
        });
    }

    const code = crypto.randomBytes(8)
        .toString("hex")
        .toUpperCase();

    const result = await run(`
        INSERT INTO leagues (name, invite_code, owner_id)
        VALUES (?, ?, ?)
    `, [name, code, req.user.id]);

    await addMember(req.user.id, result.id);

    res.status(201).json({
        id: result.id,
        invite_code: code
    });
}));

// Join an existing league using its invite code.
app.post("/api/leagues/join", requireLogin, asyncRoute(async (req, res) => {
    const code = String(req.body.code || "").trim().toUpperCase();

    const league = await get(`
        SELECT id FROM leagues WHERE invite_code = ?
    `, [code]);

    if (!league) {
        return res.status(404).json({
            error: "League invite code not found."
        });
    }

    const existing = await get(`
        SELECT 1 FROM memberships
        WHERE user_id = ? AND league_id = ?
    `, [req.user.id, league.id]);

    if (existing) {
        return res.status(409).json({
            error: "You are already in this league."
        });
    }

    await addMember(req.user.id, league.id);

    res.json({ id: league.id });
}));

// Get a league's information and rankings.
app.get("/api/leagues/:id", requireLogin, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);

    const membership = await get(`
        SELECT 1 FROM memberships
        WHERE user_id = ? AND league_id = ?
    `, [req.user.id, id]);

    if (!membership) {
        return res.status(404).json({
            error: "League not found."
        });
    }

    const league = await get(`
        SELECT * FROM leagues WHERE id = ?
    `, [id]);

    const standings = await all(`
        SELECT
            users.username,
            rosters.id AS roster_id,
            rosters.name AS roster_name,
            rosters.points
        FROM rosters
        JOIN users ON users.id = rosters.user_id
        WHERE rosters.league_id = ?
        ORDER BY rosters.points DESC, users.username
    `, [id]);

    res.json({ league, standings });
}));

// ------------------------------
// ROSTERS
// ------------------------------

// Get all rosters owned by the current user.
app.get("/api/rosters", requireLogin, asyncRoute(async (req, res) => {
    const rosters = await all(`
        SELECT rosters.*, leagues.name AS league_name
        FROM rosters
        JOIN leagues ON leagues.id = rosters.league_id
        WHERE rosters.user_id = ?
        ORDER BY rosters.id DESC
    `, [req.user.id]);

    res.json({ rosters });
}));

// Get one roster and its fighters.
app.get("/api/rosters/:id", requireLogin, asyncRoute(async (req, res) => {
    const roster = await get(`
        SELECT rosters.*, leagues.name AS league_name
        FROM rosters
        JOIN leagues ON leagues.id = rosters.league_id
        WHERE rosters.id = ? AND rosters.user_id = ?
    `, [Number(req.params.id), req.user.id]);

    if (!roster) {
        return res.status(404).json({
            error: "Roster not found."
        });
    }

    const fighters = await all(`
        SELECT fighter_name
        FROM roster_fighters
        WHERE roster_id = ?
        ORDER BY fighter_name
    `, [roster.id]);

    res.json({ roster, fighters });
}));

// Rename a roster.
app.patch("/api/rosters/:id", requireLogin, asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (name.length < 2 || name.length > 60) {
        return res.status(400).json({
            error: "Roster name must be 2-60 characters."
        });
    }

    const result = await run(`
        UPDATE rosters SET name = ?
        WHERE id = ? AND user_id = ?
    `, [name, Number(req.params.id), req.user.id]);

    if (!result.changes) {
        return res.status(404).json({
            error: "Roster not found."
        });
    }

    res.json({ ok: true });
}));

// Read fighter names from your existing scraper output.
function getFighterNames() {
    const file = path.join(__dirname, "data", "ufc_roster.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return new Set((data.fighters || []).map(f => f.name));
}

// Add a fighter to a roster.
app.post("/api/rosters/:id/fighters", requireLogin,
    asyncRoute(async (req, res) => {
        const id = Number(req.params.id);
        const name = String(req.body.name || "").trim();

        if (!getFighterNames().has(name)) {
            return res.status(400).json({
                error: "Select a fighter from the fighter list."
            });
        }

        const roster = await get(`
            SELECT id FROM rosters
            WHERE id = ? AND user_id = ?
        `, [id, req.user.id]);

        if (!roster) {
            return res.status(404).json({
                error: "Roster not found."
            });
        }

        try {
            await run(`
                INSERT INTO roster_fighters
                    (roster_id, fighter_name)
                VALUES (?, ?)
            `, [id, name]);

            res.status(201).json({ ok: true });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT") {
                return res.status(409).json({
                    error: "Fighter already on this roster."
                });
            }
            throw error;
        }
    })
);

// Remove a fighter from a roster.
app.delete("/api/rosters/:id/fighters", requireLogin,
    asyncRoute(async (req, res) => {
        const result = await run(`
            DELETE FROM roster_fighters
            WHERE roster_id = ?
              AND fighter_name = ?
              AND roster_id IN (
                  SELECT id FROM rosters WHERE user_id = ?
              )
        `, [
            Number(req.params.id),
            String(req.body.name || ""),
            req.user.id
        ]);

        res.json({ removed: result.changes > 0 });
    })
);

// ------------------------------
// PUBLIC FIGHTER DATA AND PAGES
// ------------------------------

// Return the scraped fighter data.
 app.get("/api/fighters", (req, res) => {
     res.sendFile(
         path.join(__dirname, "data", "ufc_roster.json")
     );
 });

 // Location of our HTML pages.
 const viewsPath = path.join(__dirname, "views");

 // Helper for serving individual pages.
 function servePage(filename) {
     return (req, res) => {
         res.sendFile(path.join(viewsPath, filename));
     };
 }

 // Home
 app.get("/", servePage("index.html"));

 // Rankings
 app.get("/rankings", servePage("rankings.html"));

 // Fighter List
 app.get("/fighterlist", servePage("fighterlist.html"));

 // Leagues
 app.get("/leagues", servePage("leagues.html"));

 // My Team
 app.get("/myteam", servePage("myteam.html"));

 // Events
 app.get("/events", servePage("events.html"));

// Error handler.
app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({
        error: "An unexpected server error occurred."
    });
});

// Start only after database initialization succeeds.
ready.then(() => {
    app.listen(PORT, () => {
        console.log(`Pound4Pound running at http://localhost:${PORT}`);
    });
}).catch(console.error);