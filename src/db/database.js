const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

// Go up two folders to the project's data directory
const dataFolder = path.join(__dirname, "..", "..", "data");

fs.mkdirSync(dataFolder, { recursive: true });

const db = new sqlite3.Database(
    path.join(dataFolder, "fantasy.db")
);

const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) return reject(error);

            resolve({
                id: this.lastID,
                changes: this.changes
            });
        });
    });

const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row);
        });
    });

const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) return reject(error);
            resolve(rows);
        });
    });

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS memberships (
    user_id INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, league_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    FOREIGN KEY (league_id) REFERENCES leagues(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rosters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    league_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'My Roster',
    points REAL NOT NULL DEFAULT 0,
    UNIQUE (user_id, league_id),
    FOREIGN KEY (user_id, league_id)
        REFERENCES memberships(user_id, league_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS roster_fighters (
    roster_id INTEGER NOT NULL,
    fighter_name TEXT NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (roster_id, fighter_name),
    FOREIGN KEY (roster_id) REFERENCES rosters(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_expiry
ON sessions(expires_at);
`;

const ready = new Promise((resolve, reject) => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON");
        db.exec(schema, (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
});

module.exports = { db, run, get, all, ready };