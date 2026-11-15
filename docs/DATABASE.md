# SQLite Proposal

## Decision

Use SQLite for the local MVP. Store the database at `data/kanban.sqlite3` on the host. In Docker, set `DATABASE_PATH=/data/kanban.sqlite3` and bind-mount the host `data/` directory to `/data` so data survives container replacement. The backend creates the parent directory and database when they do not exist.

The JSON interchange shape is defined in [kanban-board.schema.json](kanban-board.schema.json), with representative initial data in [kanban-board.example.json](kanban-board.example.json). It mirrors the current frontend model while leaving database storage normalized.

## Tables and constraints

- `users`: `id` primary key, unique `username`, and `password_hash` (salted scrypt, `salt_hex:hash_hex`). Plain passwords are never stored.
- `boards`: `id` primary key, non-null `user_id` foreign key to `users` (indexed, cascade delete), and non-blank `name`. A user can own any number of boards, listed in creation (`rowid`) order.
- `columns`: primary key `(board_id, id)`, `board_id` foreign key, editable `title`, and integer `position`; unique `(board_id, position)` preserves order.
- `cards`: primary key `(board_id, id)`, foreign key `(board_id, column_id)` to `columns`, `title`, `details`, and integer `position`; unique `(board_id, column_id, position)` preserves order and each card belongs to one column of its own board.

Column and card IDs are scoped to their board, so every user's board can use the same five fixed column IDs and card IDs never collide across users. New users and boards get generated IDs when seeded.

Enable SQLite foreign keys on every connection. Use cascading deletion from a board to its columns and from a column to its cards. A user's board is selected through `boards.user_id`; board ownership is never inferred from client-provided card or column IDs alone.

## Ordering and JSON mapping

The JSON arrays are ordered: `columns` order is the board's column order, and each column's `cardIds` order is its card order. In SQLite, store those positions as zero-based integers. Convert between the normalized rows and JSON by sorting on `position`; card objects are keyed by card ID in the JSON `cards` map.

The five MVP column identities are fixed; application validation must reject added, removed, or substituted columns. Only their titles and positions may change. Card membership and order are stored on the card's `column_id` and `position`, then projected into each JSON column's ordered `cardIds` list.

## Validation rules

- The MVP board has exactly five fixed column IDs. Column and card IDs are unique within their board.
- Column and card positions are non-negative and gap-free, starting at zero after each update.
- Every `cardIds` entry must identify one card in the same board, and every card must occur in exactly one column. Enforce these cross-reference rules in application validation and transactional writes; JSON Schema alone cannot assert object-key/reference equality.
- Usernames are unique. IDs, titles, and usernames are non-empty; card details may be empty.
- Keep the example's `users`, `columns`, and `cards` relationships valid when changing the schema or sample.

## Initialization and schema changes

On backend startup, open the configured database, apply migrations, and create the demo user `user` / `password` with the example board only if that user does not exist (an existing demo user without a password hash gets one). Do not overwrite existing boards on restart. Registered users and new boards start with the five default columns and no cards.

Track the schema version with SQLite `PRAGMA user_version`. Apply ordered, transactional migrations during startup before serving requests. Keep migrations in `backend/migrations/`; never rely on deleting the database to apply a schema change. Integration tests should use a temporary database path.

## Implementation status

The user approved this design before Part 6. The Part 6 backend initializes the schema at startup, seeds only when the authenticated user's board is absent, and applies full-board replacements transactionally. The Docker start scripts bind-mount host `data/` at `/data`; `DATABASE_PATH` defaults to `/data/kanban.sqlite3` in the image. The API contract is documented in [API.md](API.md).

Migration `002_board_scoped_ids.sql` (schema version 2) rebuilds `columns` and `cards` with board-scoped keys and copies existing rows unchanged.

Migration `003_users_and_multiple_boards.sql` (schema version 3) adds `users.password_hash` and rebuilds `boards` without the one-board-per-user constraint, naming existing boards `Project board`. Migrations run with foreign keys disabled and `PRAGMA foreign_key_check` must pass before each commit.
