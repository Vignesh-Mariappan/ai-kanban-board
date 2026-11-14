# SQLite Proposal

## Decision

Use SQLite for the local MVP. Store the database at `data/kanban.sqlite3` on the host. In Docker, set `DATABASE_PATH=/data/kanban.sqlite3` and bind-mount the host `data/` directory to `/data` so data survives container replacement. The backend creates the parent directory and database when they do not exist.

The JSON interchange shape is defined in [kanban-board.schema.json](kanban-board.schema.json), with representative initial data in [kanban-board.example.json](kanban-board.example.json). It mirrors the current frontend model while leaving database storage normalized.

## Tables and constraints

- `users`: `id` primary key and unique `username`. Do not store the Part 4 demo password in the database; it is not real authentication.
- `boards`: `id` primary key and `user_id` unique, non-null foreign key to `users`. The unique constraint enforces one board per user.
- `columns`: `id` primary key, `board_id` foreign key, editable `title`, and integer `position`; unique `(board_id, position)` preserves order.
- `cards`: `id` primary key, `column_id` foreign key, `title`, `details`, and integer `position`; unique `(column_id, position)` preserves order and each card belongs to one column.

Enable SQLite foreign keys on every connection. Use cascading deletion from a board to its columns and from a column to its cards. A user's board is selected through `boards.user_id`; board ownership is never inferred from client-provided card or column IDs alone.

## Ordering and JSON mapping

The JSON arrays are ordered: `columns` order is the board's column order, and each column's `cardIds` order is its card order. In SQLite, store those positions as zero-based integers. Convert between the normalized rows and JSON by sorting on `position`; card objects are keyed by card ID in the JSON `cards` map.

The five MVP column identities are fixed; application validation must reject added, removed, or substituted columns. Only their titles and positions may change. Card membership and order are stored on the card's `column_id` and `position`, then projected into each JSON column's ordered `cardIds` list.

## Validation rules

- Each user has one board; the schema represents that board as a single object and SQLite enforces it with `UNIQUE(boards.user_id)`.
- The MVP board has exactly five fixed column IDs. Column and card IDs are unique in their respective tables.
- Column and card positions are non-negative and gap-free, starting at zero after each update.
- Every `cardIds` entry must identify one card in the same board, and every card must occur in exactly one column. Enforce these cross-reference rules in application validation and transactional writes; JSON Schema alone cannot assert object-key/reference equality.
- Usernames are unique. IDs, titles, and usernames are non-empty; card details may be empty.
- Keep the example's `users`, `columns`, and `cards` relationships valid when changing the schema or sample.

## Initialization and schema changes

On backend startup, open the configured database, enable foreign keys, create tables if absent, and seed the MVP user and initial board only when no board exists for that user. Do not overwrite an existing board on restart.

Track the schema version with SQLite `PRAGMA user_version`. Apply ordered, transactional migrations during startup before serving requests. Keep migrations in `backend/migrations/`; never rely on deleting the database to apply a schema change. Integration tests should use a temporary database path.

## Implementation status

The user approved this design before Part 6. The Part 6 backend initializes the schema at startup, seeds only when the authenticated user's board is absent, and applies full-board replacements transactionally. The Docker start scripts bind-mount host `data/` at `/data`; `DATABASE_PATH` defaults to `/data/kanban.sqlite3` in the image. The API contract is documented in [API.md](API.md).