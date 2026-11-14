ALTER TABLE cards RENAME TO cards_old;
ALTER TABLE columns RENAME TO columns_old;

CREATE TABLE columns (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (board_id, id),
    UNIQUE (board_id, position)
);

CREATE TABLE cards (
    board_id TEXT NOT NULL,
    id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id) ON DELETE CASCADE,
    UNIQUE (board_id, column_id, position)
);

INSERT INTO columns (board_id, id, title, position)
SELECT board_id, id, title, position FROM columns_old;

INSERT INTO cards (board_id, id, column_id, title, details, position)
SELECT columns_old.board_id, cards_old.id, cards_old.column_id,
       cards_old.title, cards_old.details, cards_old.position
FROM cards_old JOIN columns_old ON columns_old.id = cards_old.column_id;

DROP TABLE cards_old;
DROP TABLE columns_old;
