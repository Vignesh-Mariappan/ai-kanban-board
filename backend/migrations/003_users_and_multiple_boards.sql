ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE TABLE boards_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0)
);

INSERT INTO boards_new (id, user_id, name)
SELECT id, user_id, 'Project board' FROM boards;

DROP TABLE boards;
ALTER TABLE boards_new RENAME TO boards;

CREATE INDEX boards_user_id ON boards (user_id);
