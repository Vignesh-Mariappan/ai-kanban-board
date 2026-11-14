# Code Review

Scope: full codebase review of `backend/`, `frontend/src/`, `Dockerfile`, and `scripts/` as of 2026-11-14. All automated suites pass (backend 31, frontend unit 23, Playwright 10), so the issues below are not covered by existing tests.

Severity: High = data loss or a stated requirement broken. Medium = user-visible bug. Low = cleanup, simplification, or hardening.

## Summary

| # | Severity | Area | Issue | Status |
|---|---|---|---|---|
| 1 | High | Database | Schema cannot hold a second user's board | Fixed |
| 2 | High | Chat API | AI board updates overwrite edits made while the AI is responding | Fixed |
| 3 | Medium | Frontend | Column title input does not reflect AI renames or failed saves | Fixed |
| 4 | Medium | Frontend | Card edit form opens with stale values and can revert AI edits | Fixed |
| 5 | Medium | Frontend | Selecting text in the card edit form starts a drag | Fixed |
| 6 | Medium | Frontend | Sign-in hangs on characters `btoa` cannot encode | Fixed |
| 7 | Low | Frontend | Editing a card that was deleted meanwhile sends an invalid board | Open |
| 8 | Low | Frontend | Dead unauthenticated in-memory mode and duplicated seed data | Open |
| 9 | Low | Backend | Leftover `/api/hello` demo route | Open |
| 10 | Low | Backend | Redundant board-not-found checks in `PUT /api/board` | Open |
| 11 | Low | Backend | Duplicated OpenRouter request branches | Open |
| 12 | Low | Backend | `SCHEMA_VERSION` must be bumped by hand alongside migrations | Open |
| 13 | Low | AI | Prompt lacks a system role and explicit board rules | Open |
| 14 | Low | Frontend | Drag and drop is not keyboard accessible | Open |
| 15 | Low | Frontend | Duplicated API error parsing | Open |
| 16 | Low | Repo | Ignored test artifact is tracked in git | Open |

## Issues and action items

### 1. Schema cannot hold a second user's board (High)

Status: Fixed. Migration `002_board_scoped_ids.sql` scopes column and card keys to their board, `database.py` generates user and board IDs when seeding and joins on `board_id`, and tests cover two users with identical IDs and migrating an existing version 1 database.

`backend/migrations/001_initial.sql:11-26` makes `columns.id` and `cards.id` global primary keys, while `backend/app/schemas.py:3-9` requires every board to use the same five column IDs (`col-backlog`, ...). A second user's board therefore fails on its first column insert. Verified against the migration:

```
INSERT INTO columns VALUES('col-backlog','b2','Backlog',0);
Error: UNIQUE constraint failed: columns.id
```

Related consequences:
- `initialize_database` (`backend/app/database.py:46-62`) seeds with the fixed user and board IDs from the example JSON, so seeding any other username silently skips the user insert and then fails on `user["id"]`.
- A `PUT /api/board` or AI update containing a card ID that exists on another board raises an unhandled `sqlite3.IntegrityError` (HTTP 500).

AGENTS.md requires the database to support multiple users in the future, so this blocks that requirement.

Action items:
- Add `backend/migrations/002_board_scoped_ids.sql` that rebuilds `columns` with primary key `(board_id, id)` and `cards` with primary key `(board_id, id)` plus a foreign key `(board_id, column_id)` to `columns`. Bump `SCHEMA_VERSION`.
- Update the `database.py` queries to join on `board_id` as well as the ID.
- Generate user and board IDs when seeding a new username instead of reusing the example file's IDs.
- Add a test that initializes two users and saves boards with identical column and card IDs.
- Update `docs/DATABASE.md`.

### 2. AI board updates overwrite concurrent edits (High)

Status: Fixed. `replace_board` takes an `expected_board` snapshot and raises `BoardChangedError` inside a `BEGIN IMMEDIATE` transaction if the stored board differs; `POST /api/chat` returns `409` and the chat shows the message.

`backend/app/main.py:92-113` loads the board, waits for the model (up to 30 s), then replaces the whole board with the model's version. Any card the user adds, edits, or moves in the meantime is silently discarded. The frontend does not block board edits while a chat request is pending (`ChatSidebar.tsx` only disables the chat input).

Action items:
- Inside the `replace_board` transaction for chat, reload the current board and compare it with the snapshot sent to the model. If they differ, roll back and return `409` with a clear message ("The board changed while the assistant was responding; please retry").
- Show that message in the chat error state and add a backend test that changes the board between the prompt and the save.

### 3. Column title input is stale (Medium)

Status: Fixed. The input is keyed by the saved title and resets to it on blur, so AI renames appear and rejected renames revert.

`frontend/src/components/KanbanColumn.tsx:44-45` uses an uncontrolled input with `defaultValue={column.title}` and a stable `key`. When the AI renames a column, the header chips update but the input keeps showing the old title. When a rename save fails, the input keeps the rejected title while the board state keeps the old one.

Action items:
- Add `key={column.title}` to the input so it resets whenever the saved title changes. Alternatively, make it a controlled input synced to `column.title`.
- Add a component test that re-renders with a new column title and asserts the input value.

### 4. Card edit form opens with stale values (Medium)

Status: Fixed. Opening the editor resets the draft to the current card text.

`frontend/src/components/KanbanCard.tsx:15-16` initializes `title` and `details` state once, when the card mounts. After an AI edit, clicking Edit shows the old text, and saving reverts the AI's change. Text typed and then cancelled also reappears on the next edit.

Action items:
- Reset local state from `card` when entering edit mode, e.g. `onClick={() => { setTitle(card.title); setDetails(card.details); setIsEditing(true); }}`.
- Add a test: re-render with a new card title, open the edit form, and assert the new value.

### 5. Edit form sits inside drag listeners (Medium)

Status: Fixed. The sortable attributes and drag listeners are not applied while the card is being edited. (Using `useSortable`'s `disabled` option instead marks the whole card `aria-disabled`, which disables the form for assistive technology.)

`frontend/src/components/KanbanCard.tsx:44-45` spreads the sortable `attributes` and `listeners` on the whole `<article>`, including while the edit form is open. Selecting text in the edit inputs with the mouse moves more than the 6px activation distance and starts a card drag.

Action items:
- Spread `listeners` only when `!isEditing`, or pass `disabled: isEditing` to `useSortable`.

### 6. Sign-in hangs on characters `btoa` cannot encode (Medium)

Status: Fixed. `createBasicAuthHeader` encodes credentials as UTF-8 before Base64 (RFC 7617), so it cannot throw, and the call is inside the `try` block.

`frontend/src/components/SignInGate.tsx:84` calls `createBasicAuthHeader` before the `try` block. `btoa` throws `InvalidCharacterError` for characters outside Latin-1 (verified with `btoa("Łukasz:pw")`), so the rejection is unhandled and the button stays on "Signing in..." until reload.

Action items:
- Move the `createBasicAuthHeader` call inside the `try` block so the existing error path handles it.

### 7. Editing a deleted card sends an invalid board (Low)

`frontend/src/components/KanbanBoard.tsx:143-150` spreads `prev.cards[cardId]` without checking it exists. If the AI deleted the card while its edit form was open, the update creates a card without an `id` and the save fails with a 422.

Action items:
- Return `prev` unchanged when `prev.cards[cardId]` is missing.

### 8. Dead unauthenticated mode and duplicated seed data (Low)

`page.tsx` always passes `authHeader`, so the `!authHeader` branches in `KanbanBoard.tsx:49-54` and `153-156`, and the `initialData` default (`frontend/src/lib/kanban.ts:18-72`), are only used by tests. `initialData` also duplicates `docs/kanban-board.example.json` with different content.

Action items:
- Make `initialBoard` and `authHeader` required, remove the in-memory branches and `initialData`, and update the tests to pass a fixture board and a mocked `fetch`.

### 9. Leftover `/api/hello` route (Low)

`backend/app/main.py:123-125` keeps the Part 2 demo route, and its test and `docs/API.md` still mention it.

Action items:
- Remove the route, `test_example_api_returns_hello_world`, and the API.md note.

### 10. Redundant not-found checks in `PUT /api/board` (Low)

`backend/app/main.py:80-85` checks for a missing board twice in a row, and `replace_board` then reopens a connection to reload the same data.

Action items:
- Have `replace_board` return the saved board (or `None`) and use a single check.

### 11. Duplicated OpenRouter request branches (Low)

`backend/app/openrouter.py:70-83` has two near-identical `post` calls. The injected-client branch also bypasses the CA bundle and timeout settings, so tests exercise a different path than production.

Action items:
- Build the client once (injected client or a new `httpx.Client(timeout=30, verify=self._ssl_context())`) and make a single `post` call.

### 12. `SCHEMA_VERSION` maintained by hand (Low)

`backend/app/database.py:13` and `105` need a manual bump that must match the highest migration file number, which is easy to miss when adding a migration.

Action items:
- Derive the supported version from the highest migration file number and drop the constant and the final consistency check.

### 13. Prompt lacks a system role and explicit rules (Low)

`backend/app/chat.py:57-72` sends everything as a single user message. The model is never told the hard rules that `BoardData` enforces: exactly the five fixed column IDs, the card ID pattern, `cardIds` membership, and card map keys matching IDs. Violations become 502s that the user has to retry. Card text and the question share a channel with the instructions, which makes prompt injection easier.

Action items:
- Send the instructions and validation rules as a `system` message, and the board, history, and question as the `user` message. Keep `OpenRouterClient.complete` as the single place that formats provider messages.
- Consider raising the 30 s timeout (`openrouter.py:75,78`); full-board JSON from a reasoning model can be slow.

### 14. Drag and drop is not keyboard accessible (Low)

`frontend/src/components/KanbanBoard.tsx:40-44` registers only `PointerSensor`.

Action items:
- Add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`.

### 15. Duplicated API error parsing (Low)

`frontend/src/lib/board-api.ts:28-39` and `frontend/src/lib/chat-api.ts:39-50` contain the same response-to-error logic.

Action items:
- Extract one `readErrorDetail(response, fallback)` helper and use it in both clients.

### 16. Tracked test artifact (Low)

`frontend/test-results/.last-run.json` is staged in git even though the root `.gitignore` ignores `frontend/test-results/`.

Action items:
- Run `git rm --cached frontend/test-results/.last-run.json`.

## Test gaps

- Two users with identical column and card IDs (issue 1).
- A board change between the chat prompt and the save (issue 2).
- UI reflecting AI-driven column renames and card edits in the column input and edit form (issues 3 and 4).
