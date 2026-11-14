# Backend API

The API is local-MVP only. Board routes use HTTP Basic credentials `user` / `password`. They are not production authentication and must only be used on the local Docker app. Passwords are not stored in SQLite.

## Routes

### `GET /api/health`

Public process health check. Returns `{"status":"ok"}`.

### `GET /api/board`

Requires HTTP Basic authentication. Returns the authenticated user's board in the JSON shape defined by [kanban-board.schema.json](kanban-board.schema.json), without the outer `users` collection or database-level user/board IDs. Columns remain ordered, and each card is keyed by ID.

### `PUT /api/board`

Requires HTTP Basic authentication. Replaces the authenticated user's complete board in one SQLite transaction and returns the saved board. The request must contain exactly the five fixed column IDs. Every card ID must appear in exactly one column's `cardIds`, and each `cards` map key must match its card's ID. A malformed board returns `422` and leaves the saved board unchanged.

### `POST /api/chat`

Requires HTTP Basic authentication. Accepts a non-empty `question` and optional conversation `history`, an ordered list of user and assistant messages. The backend loads the authenticated user's current board and sends it with the question and history to the AI service.

Returns `{"response":"...","board_updated":false}` when no board change is proposed. When the AI returns a complete valid board update, the backend validates and saves it transactionally, then returns `board_updated: true`. Invalid AI output or provider errors return `502` without changing the saved board; missing OpenRouter configuration returns `503`. If the saved board changes while the AI is responding, the AI update is discarded and the route returns `409` so the user's edits are not overwritten.

Chat history is held in the current browser tab's `sessionStorage`. It is sent with chat requests, is retained across reloads in that tab, and is cleared on sign-out or tab close. It is not stored in SQLite.

When OpenRouter is accessed through a TLS-inspecting network, provide the organization's trusted PEM CA certificate bundle at `data/openrouter-ca.pem`; the container adds it to the system trust store without disabling certificate or hostname verification. `OPENROUTER_CA_BUNDLE` can be set to a different path inside the container. Obtain the certificate from your IT team.

## Errors

- `401 Unauthorized`: missing or invalid Basic credentials.
- `404 Not Found`: authenticated user has no board.
- `409 Conflict`: the board changed while the AI was responding; the AI update was not applied.
- `422 Unprocessable Entity`: invalid board payload.
- `502 Bad Gateway`: AI provider failure or invalid AI response.
- `503 Service Unavailable`: OpenRouter is not configured.

TLS verification failures return a safe message indicating that a trusted CA bundle must be configured. Provider errors do not expose response bodies or credentials.

The `GET /api/hello` demonstration route remains public and is not part of the Kanban API contract.