
const main = document.querySelector("#page-content");

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}


async function loadPage() {
    if (!main) return;

    const page = document.body.dataset.page;

    try {
        // Pages anyone can view
        if (page === "events") {
            eventsPage();
            return;
        }

        // Show a different message depending on the page
        // when someone isn't logged in.
        if (!currentUser) {
            const messages = {
                index: {
                    title: "Welcome to Pound4Pound",
                    description: "The home of Fantasy MMA. Create an account to build your roster and compete with friends."
                },
                leagues: {
                    title: "My Leagues",
                    description: "Log in or sign up to create leagues, join friends, and manage your competitions."
                },
                rankings: {
                    title: "League Rankings",
                    description: "Log in to view the standings for your leagues."
                },
                myteam: {
                    title: "My Team",
                    description: "Log in to manage your fantasy fighters and rosters."
                }
            };

            const content = messages[page] || messages.index;

            main.innerHTML = `
                <h1>${content.title}</h1>
                <p>${content.description}</p>

                <button class="btn" id="page-login">
                    Log In
                </button>

                <button class="btn" id="page-signup">
                    Sign Up
                </button>
            `;

            document.querySelector("#page-login").onclick =
                () => showAuth("login");

            document.querySelector("#page-signup").onclick =
                () => showAuth("signup");

            return;
        }

        // Display the appropriate page when logged in.
        if (page === "leagues") {
            await leaguesPage();
        } else if (page === "myteam") {
            await rosterPage();
        } else if (page === "rankings") {
            await rankingsPage();
        } else {
            homePage();
        }

    } catch (error) {
        console.error(error);
        setNotice(error.message, true);
    }
}


// -----------------------------
// HOME
// -----------------------------

function homePage() {
    main.innerHTML = `
        <h1>Welcome, ${escapeHTML(currentUser.username)}!</h1>
        <p>Welcome to your Fantasy MMA dashboard.</p>

        <section class="panels">
            <article class="panel">
                <h2>My Leagues</h2>
                <p>Create leagues or join your friends.</p>
                <a href="/leagues">Manage Leagues</a>
            </article>

            <article class="panel">
                <h2>My Rosters</h2>
                <p>Choose fighters for each league.</p>
                <a href="/myteam">Manage Rosters</a>
            </article>

            <article class="panel">
                <h2>Rankings</h2>
                <p>See how your teams compare.</p>
                <a href="/rankings">View Rankings</a>
            </article>
        </section>
    `;
}

// -----------------------------
// LEAGUES
// -----------------------------

async function leaguesPage() {
    const data = await api("/api/leagues");

    main.innerHTML = `
        <h1>My Leagues</h1>

        <section class="panels">
            <form id="create-league" class="panel">
                <h2>Create a League</h2>
                <input name="name" placeholder="League Name"
                    minlength="3" maxlength="60" required>
                <button class="btn">Create</button>
            </form>

            <form id="join-league" class="panel">
                <h2>Join a League</h2>
                <input name="code" placeholder="Invite Code"
                    required>
                <button class="btn">Join</button>
            </form>
        </section>

        <h2>Your Leagues</h2>

        <div id="league-list">
            ${data.leagues.length
                ? data.leagues.map(league => `
                    <article class="panel">
                        <h2>${escapeHTML(league.name)}</h2>
                        <p>${league.member_count} members</p>
                        <p>Invite Code:
                            <strong>${escapeHTML(league.invite_code)}</strong>
                        </p>
                        <a href="/rankings?league=${league.id}">
                            View Rankings
                        </a>
                    </article>
                `).join("")
                : "<p>You haven't joined any leagues yet.</p>"
            }
        </div>
    `;

    document.querySelector("#create-league").onsubmit =
        async (event) => {
            event.preventDefault();

            const name = new FormData(event.target).get("name");

            try {
                await post("/api/leagues", { name });
                await leaguesPage();
                setNotice("League created!");
            } catch (error) {
                setNotice(error.message, true);
            }
        };

    document.querySelector("#join-league").onsubmit =
        async (event) => {
            event.preventDefault();

            const code = new FormData(event.target).get("code");

            try {
                await post("/api/leagues/join", { code });
                await leaguesPage();
                setNotice("You joined the league!");
            } catch (error) {
                setNotice(error.message, true);
            }
        };
}

// -----------------------------
// MY TEAM / ROSTERS
// -----------------------------

async function rosterPage() {
    const data = await api("/api/rosters");

    main.innerHTML = `
        <h1>My Rosters</h1>

        ${data.rosters.length
            ? data.rosters.map(roster => `
                <article class="panel">
                    <h2>${escapeHTML(roster.name)}</h2>
                    <p>League: ${escapeHTML(roster.league_name)}</p>
                    <p>Points: ${roster.points}</p>
                    <button class="btn roster-open"
                        data-id="${roster.id}">
                        Manage Roster
                    </button>
                </article>
            `).join("")
            : `
                <p>No rosters yet. Create or join a league first.</p>
                <a href="/leagues">Go to Leagues</a>
            `
        }

        <section id="roster-detail"></section>
    `;

    document.querySelectorAll(".roster-open").forEach(button => {
        button.onclick = () => openRoster(button.dataset.id);
    });
}

async function openRoster(id) {
    const data = await api("/api/rosters/" + id);
    const fighterData = await api("/api/fighters");

    const fighters = fighterData.fighters || [];
    const element = document.querySelector("#roster-detail");

    element.innerHTML = `
        <h2>${escapeHTML(data.roster.name)}</h2>
        <p>${escapeHTML(data.roster.league_name)}</p>

        <form id="rename-roster">
            <input name="name"
                value="${escapeHTML(data.roster.name)}"
                minlength="2" maxlength="60" required>
            <button class="btn">Rename</button>
        </form>

        <form id="add-fighter">
            <select name="name" required>
                <option value="">Select a Fighter</option>
                ${fighters.map(fighter => `
                    <option value="${escapeHTML(fighter.name)}">
                        ${escapeHTML(fighter.name)}
                    </option>
                `).join("")}
            </select>

            <button class="btn">Add Fighter</button>
        </form>

        <h3>Selected Fighters</h3>

        <ul>
            ${data.fighters.length
                ? data.fighters.map(fighter => `
                    <li>
                        ${escapeHTML(fighter.fighter_name)}
                        <button class="remove-fighter"
                            data-name="${escapeHTML(fighter.fighter_name)}">
                            Remove
                        </button>
                    </li>
                `).join("")
                : "<li>No fighters selected yet.</li>"
            }
        </ul>
    `;

    document.querySelector("#rename-roster").onsubmit =
        async (event) => {
            event.preventDefault();

            const name = new FormData(event.target).get("name");

            try {
                await post("/api/rosters/" + id, { name }, "PATCH");
                await rosterPage();
                setNotice("Roster renamed.");
            } catch (error) {
                setNotice(error.message, true);
            }
        };

    document.querySelector("#add-fighter").onsubmit =
        async (event) => {
            event.preventDefault();

            const name = new FormData(event.target).get("name");

            try {
                await post(
                    "/api/rosters/" + id + "/fighters",
                    { name }
                );

                await openRoster(id);
                setNotice("Fighter added!");
            } catch (error) {
                setNotice(error.message, true);
            }
        };

    document.querySelectorAll(".remove-fighter")
        .forEach(button => {
            button.onclick = async () => {
                try {
                    await post(
                        "/api/rosters/" + id + "/fighters",
                        { name: button.dataset.name },
                        "DELETE"
                    );

                    await openRoster(id);
                    setNotice("Fighter removed.");
                } catch (error) {
                    setNotice(error.message, true);
                }
            };
        });
}

// -----------------------------
// LEAGUE RANKINGS
// -----------------------------

async function rankingsPage() {
    const data = await api("/api/leagues");

    const query = new URLSearchParams(window.location.search);

    const selected = query.get("league") ||
        data.leagues[0]?.id;

    if (!selected) {
        main.innerHTML = `
            <h1>League Rankings</h1>
            <p>Join a league to view its standings.</p>
        `;
        return;
    }

    const detail = await api("/api/leagues/" + selected);

    main.innerHTML = `
        <h1>League Rankings</h1>

        <label>
            Select League:
            <select id="league-choice">
                ${data.leagues.map(league => `
                    <option value="${league.id}"
                        ${league.id == selected ? "selected" : ""}>
                        ${escapeHTML(league.name)}
                    </option>
                `).join("")}
            </select>
        </label>

        <h2>${escapeHTML(detail.league.name)}</h2>

        <table class="standings">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Owner</th>
                    <th>Roster</th>
                    <th>Points</th>
                </tr>
            </thead>

            <tbody>
                ${detail.standings.map((roster, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHTML(roster.username)}</td>
                        <td>${escapeHTML(roster.roster_name)}</td>
                        <td>${roster.points}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>

        <p>Points will update when the scoring engine
        is implemented.</p>
    `;

    document.querySelector("#league-choice").onchange =
        event => {
            window.location.href =
                "/rankings?league=" + event.target.value;
        };
}

// -----------------------------
// EVENTS
// -----------------------------

function eventsPage() {
    main.innerHTML = `
        <h1>UFC Events</h1>

        <article class="panel">
            <h2>Upcoming Feature</h2>
            <p>
                This page will eventually show upcoming fights,
                completed UFC events, and fantasy points awarded
                to fighters on your rosters.
            </p>
        </article>
    `;
}

// Load the appropriate page once login status is known.
document.addEventListener("authready", loadPage);
