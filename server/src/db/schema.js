export const SCHEMA = `
CREATE TABLE IF NOT EXISTS vault_config (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash BLOB    NOT NULL,
    salt          BLOB    NOT NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    icon       TEXT    NOT NULL DEFAULT '📁',
    color      TEXT    NOT NULL DEFAULT '#888',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS passwords (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT    NOT NULL,
    username          TEXT    NOT NULL DEFAULT '',
    encrypted_password TEXT   NOT NULL,
    url               TEXT    NOT NULL DEFAULT '',
    notes             TEXT    NOT NULL DEFAULT '',
    category_id       INTEGER,
    favorite          INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS password_tags (
    password_id INTEGER NOT NULL,
    tag_id      INTEGER NOT NULL,
    PRIMARY KEY (password_id, tag_id),
    FOREIGN KEY (password_id) REFERENCES passwords(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS totp_entries (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    encrypted_secret TEXT    NOT NULL,
    issuer           TEXT    NOT NULL DEFAULT '',
    account          TEXT    NOT NULL DEFAULT '',
    period           INTEGER NOT NULL DEFAULT 30,
    digits           INTEGER NOT NULL DEFAULT 6,
    algorithm        TEXT    NOT NULL DEFAULT 'SHA1',
    created_at       TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT    NOT NULL,
    encrypted_content TEXT    NOT NULL,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id        INTEGER NOT NULL,
    filename       TEXT    NOT NULL,
    encrypted_data TEXT    NOT NULL,
    mime_type      TEXT    NOT NULL DEFAULT 'application/octet-stream',
    size           INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT    NOT NULL,
    entity_type TEXT    NOT NULL,
    entity_id   INTEGER,
    detail      TEXT    NOT NULL DEFAULT '',
    ip          TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passwords_title ON passwords(title);
CREATE INDEX IF NOT EXISTS idx_passwords_category ON passwords(category_id);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_totp_name ON totp_entries(name);
`;
