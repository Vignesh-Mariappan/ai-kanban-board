# Backend API

The API is local-MVP only. Authenticated routes use HTTP Basic credentials checked against the `users` table, where passwords are stored as salted scrypt hashes. A demo account `user` / `password` is seeded on startup. Basic credentials are sent on every request, so only use the app locally.

## Routes

### `GET /api/health`

Public process health check. Returns `{"status":"ok"}`.

### `POST /api/users`

Public. Body `{"username": "...", "password": "..."}`. Usernames are 3-32 characters of letters, digits, `.`, `_`, or `-`; passwords are 8-128 characters. Creates the user with one empty board named `My first board` and returns `201 {"username": "..."}`. A taken username returns `409`; invalid input returns `422`.

### `GET /api/boards`

Returns the authenticated user's boards in creation order: `[{"id": "...", "name": "..."}]`.

### `POST /api/boards`

Body `{"name": "..."}` (1-80 characters, trimmed, not blank). Creates an empty board with the five default columns and returns `201 {"id", "name"}`.

### `PATCH /api/boards/{board_id}`

Body `{"name": "..."}`. Renames the board and returns `{"id", "name"}`.

### `DELETE /api/boards/{board_id}`

Deletes the board with its columns and cards. Returns `204`.

### `GET /api/boards/{board_id}`

Returns the board in the JSON shape defined by [kanban-board.schema.json](kanban-board.schema.json), without the outer `users` collection or database IDs. Columns remain ordered, and each card is keyed by ID.

### `PUT /api/boards/{board_id}`

Replaces the complete board in one SQLite transaction and returns the saved board. The request must contain exactly the five fixed column IDs. Every card ID must appear in exactly one column's `cardIds`, and each `cards` map key must match its card's ID. A malformed board returns `422` and leaves the saved board unchanged. Card and column IDs are scoped to the board.

### `POST /api/boards/{board_id}/chat`

Accepts a non-empty `question` and optional conversation `history`, an ordered list of user and assistant messages. The backend loads that board and sends it with the question and history to the AI service.

Returns `{"response":"...","board_updated":false}` when no board change is proposed. When the AI returns a complete valid board update, the backend validates and saves it to the same board transactionally, then returns `board_updated: true`. Invalid AI output or provider errors return `502` without changing the saved board; missing OpenRouter configuration returns `503`. If the saved board changes while the AI is responding, the AI update is discarded and the route returns `409` so the user's edits are not overwritten.

Chat history is held per board in the current browser tab's `sessionStorage`. It is sent with chat requests, is retained across reloads in that tab, and is cleared on sign-out, board deletion, or tab close. It is not stored in SQLite.

When OpenRouter is accessed through a TLS-inspecting network, provide the organization's trusted PEM CA certificate bundle at `data/openrouter-ca.pem`; the container adds it to the system trust store without disabling certificate or hostname verification. `OPENROUTER_CA_BUNDLE` can be set to a different path inside the container. Obtain the certificate from your IT team.

## Errors

- `401 Unauthorized`: missing or invalid Basic credentials.
- `404 Not Found`: the board does not exist or belongs to another user.
- `409 Conflict`: username already taken, or the board changed while the AI was responding.
- `422 Unprocessable Entity`: invalid user, board name, or board payload.
- `502 Bad Gateway`: AI provider failure or invalid AI response.
- `503 Service Unavailable`: OpenRouter is not configured.

TLS verification failures return a safe message indicating that a trusted CA bundle must be configured. Provider errors do not expose response bodies or credentials.

The `GET /api/hello` demonstration route remains public and is not part of the Kanban API contract.
