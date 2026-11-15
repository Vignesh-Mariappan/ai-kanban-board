# Code Review

Scope: full codebase review of `backend/`, `frontend/src/`, `Dockerfile`, and `scripts/` as of 2026-11-15 (commit `96c304c`). Backend tests pass (34 passed, 1 skipped, 92% line coverage), frontend unit tests pass (29), and lint is clean. Playwright and Docker were not run for this review.

Severity: High = data loss or a stated requirement broken. Medium = user-visible bug. Low = cleanup, simplification, or hardening.

Items 9 to 18 were raised in the previous review (commit `96c304c`) and are still open.

## Summary

| # | Severity | Area | Issue |
|---|---|---|---|
| 1 | Medium | Frontend / API | A board edit made just after an AI update can silently overwrite it |
| 2 | Medium | Frontend | Board changes are not shown until the save returns, so dropped cards snap back |
| 3 | Low | Frontend | A failed chat request keeps the unanswered question in history and loses the typed text |
| 4 | Low | Backend | Non-ASCII credentials get FastAPI's 401 with `WWW-Authenticate: Basic` |
| 5 | Low | Frontend | Deleting a card relies on a column ID captured at render time |
| 6 | Low | Frontend | New cards store the placeholder "No details yet." as real data |
| 7 | Low | Frontend | Unused code: `BoardRefreshHandler` type and `cardsById` memo |
| 8 | Low | Frontend | Chat dialog has no focus trap or `aria-modal` |
| 9 | Low | Frontend | Editing a card that was deleted meanwhile sends an invalid board |
| 10 | Low | Frontend | Dead unauthenticated in-memory mode and duplicated seed data |
| 11 | Low | Backend | Leftover `/api/hello` demo route |
| 12 | Low | Backend | Redundant board-not-found checks in `PUT /api/board` |
| 13 | Low | Backend | Duplicated OpenRouter request branches |
| 14 | Low | Backend | `SCHEMA_VERSION` must be bumped by hand alongside migrations |
| 15 | Low | AI | Prompt lacks a system role and explicit board rules |
| 16 | Low | Frontend | Drag and drop is not keyboard accessible |
| 17 | Low | Frontend | Duplicated API error parsing |
| 18 | Low | Repo | Ignored test artifact is tracked in git |
| 19 | Low | Scripts | `start.sh` stops an already-running container started on a different port |
| 20 | Low | Tests | Uncovered error paths in the backend |

## Issues and action items

### 1. Edit after an AI update can overwrite it (Medium)

`POST /api/chat` now rejects its own save with 409 if the board changed (`backend/app/main.py:113-123`), but `PUT /api/board` is still last-writer-wins. Between the moment the AI update commits on the server and the moment `refreshBoard` (`frontend/src/components/KanbanBoard.tsx:153`) replaces `boardRef`, any user edit is computed from the pre-AI board (`KanbanBoard.tsx:59`) and its PUT replaces the AI's changes. The assistant then reports "I created the card" while the card is gone. The window is short (response latency plus the refresh fetch) but the loss is silent.

Action items:
- Make PUT conditional: the client sends the board it last loaded (or a revision number stored on `boards`) and `replace_board` uses the existing `expected_board` check to return 409 on mismatch. The client then refetches and shows the save error.
- Alternatively, block board edits in the UI while a chat request is pending. Simpler, but only covers this one race.

### 2. Displayed board waits for the save (Medium)

`updateBoard` (`KanbanBoard.tsx:48-79`) only calls `setBoard` after `saveBoard` resolves. After a drop, `@dnd-kit` animates the card back to its original slot and it then jumps to the new one when the PUT returns. Renames and new cards also appear late. This was a deliberate choice ("failed saves do not silently alter the displayed board"), but the drag flicker is visible on every move.

Action items:
- Apply the update optimistically (`setBoard(nextBoard)` before the request) and roll back to the last saved board on failure, keeping the error message. This still satisfies the "not silently" requirement because the failure is surfaced.

### 3. Failed chat leaves an orphan question (Low)

`ChatSidebar.tsx:78-79` appends the user message and clears the input before the request. On any error (including the new 409), the question stays in history without an answer and is sent as history on the next request, while the typed text is gone and has to be retyped.

Action items:
- On error, restore `messages` to `previousMessages` and put `text` back into the input.

### 4. Non-ASCII credentials trigger the browser's Basic auth prompt (Low)

The frontend now UTF-8 encodes credentials, but FastAPI's `HTTPBasic` decodes the header as ASCII and fails before `authenticated_username` runs. Verified with `TestClient`:

```
Łukasz:pw   401 {'detail': 'Not authenticated'}             WWW-Authenticate: Basic
user:wrong  401 {'detail': 'Invalid username or password'}  WWW-Authenticate: None
```

The `WWW-Authenticate: Basic` header can make the browser show its native login dialog on top of the app. (Had the header got through, `hmac.compare_digest` would raise `TypeError` on non-ASCII `str` and return 500.)

Action items:
- Use `HTTPBasic(auto_error=False)` and raise the app's own 401 when credentials are missing or undecodable, and compare `.encode()` bytes in `hmac.compare_digest`.

### 5. Card delete uses a captured column ID (Low)

`KanbanColumn.tsx:72` binds `column.id` at render time and `handleDeleteCard` (`KanbanBoard.tsx:124-141`) only filters that column. If the card was moved (for example by an AI refresh) before the queued update runs, the card is removed from `cards` but stays in another column's `cardIds`, and the save fails with 422.

Action items:
- Drop the `columnId` parameter and filter `cardId` out of every column.

### 6. Placeholder stored as card details (Low)

`KanbanBoard.tsx:114` saves `details: details || "No details yet."`. The placeholder is persisted, sent to the AI as real content, and pre-filled in the edit form.

Action items:
- Save an empty string (the schema default) and render the placeholder in `KanbanCard` only when `details` is empty.

### 7. Unused code (Low)

- `BoardRefreshHandler` in `frontend/src/lib/chat-api.ts:66` is never imported.
- `cardsById` (`KanbanBoard.tsx:46`) is a `useMemo` that returns `board.cards` unchanged.

Action items:
- Remove both and use `board.cards` directly.

### 8. Chat dialog accessibility (Low)

`ChatSidebar.tsx:123-127` renders `role="dialog"` without `aria-modal` and without trapping focus, so Tab moves into the board behind the overlay.

Action items:
- Use a native `<dialog>` with `showModal()`, which provides focus trapping, Escape handling, and modal semantics.

### 9. Editing a deleted card sends an invalid board (Low, open)

`KanbanBoard.tsx:143-150` spreads `prev.cards[cardId]` without checking it exists. If the AI deleted the card while its edit form was open, the update creates a card without an `id` and the save fails with 422.

Action items:
- Return `prev` unchanged when `prev.cards[cardId]` is missing.

### 10. Dead unauthenticated mode and duplicated seed data (Low, open)

`page.tsx` always passes `authHeader`, so the `!authHeader` branches in `KanbanBoard.tsx:49-54`, `153-156`, `255`, and `287`, and the `initialData` default (`frontend/src/lib/kanban.ts:18-72`), are only used by tests. `initialData` also duplicates `docs/kanban-board.example.json` with different content.

Action items:
- Make `initialBoard` and `authHeader` required, remove the in-memory branches and `initialData`, and update the tests to pass a fixture board and a mocked `fetch`.

### 11. Leftover `/api/hello` route (Low, open)

`backend/app/main.py:132-134` keeps the Part 2 demo route, and its test and `docs/API.md` still mention it.

Action items:
- Remove the route, its test, and the API.md note.

### 12. Redundant not-found checks in `PUT /api/board` (Low, open)

`main.py:81-86` checks for a missing board twice, and `load_board` reopens a connection to reload what was just written.

Action items:
- Have `replace_board` return the saved board (or `None`) and use a single check.

### 13. Duplicated OpenRouter request branches (Low, open)

`backend/app/openrouter.py:70-83` has two near-identical `post` calls. The injected-client branch bypasses the CA bundle and timeout settings, so tests exercise a different path than production (lines 78-79 are uncovered).

Action items:
- Build the client once (injected client or `httpx.Client(timeout=30, verify=self._ssl_context())`) and make a single `post` call.

### 14. `SCHEMA_VERSION` maintained by hand (Low, open)

`backend/app/database.py:14` and `95-96` need a manual bump matching the highest migration file number.

Action items:
- Derive the version from the highest migration file and drop the constant and the final consistency check.

### 15. Prompt lacks a system role and explicit rules (Low, open)

`backend/app/chat.py:57-72` sends everything as one user message and never states the rules `BoardData` enforces (five fixed column IDs, card ID pattern, `cardIds` membership, map keys matching IDs). Violations become 502s. Instructions and user content share one channel, which makes prompt injection easier.

Action items:
- Send instructions and the validation rules as a `system` message, and the board, history, and question as the `user` message.
- Consider raising the 30 s timeout (`openrouter.py:75,78`); a full-board JSON reply from a reasoning model can be slow.

### 16. Drag and drop is not keyboard accessible (Low, open)

`KanbanBoard.tsx:40-44` registers only `PointerSensor`.

Action items:
- Add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`.

### 17. Duplicated API error parsing (Low, open)

`frontend/src/lib/board-api.ts:30-41` and `frontend/src/lib/chat-api.ts:39-50` contain the same response-to-error logic, and `BoardApiError` / `ChatApiError` are identical classes.

Action items:
- Extract one `ApiError` class and one `readErrorDetail(response, fallback)` helper used by both clients.

### 18. Tracked test artifact (Low, open)

`frontend/test-results/.last-run.json` is tracked in git although `.gitignore` ignores `frontend/test-results/`.

Action items:
- Run `git rm --cached frontend/test-results/.last-run.json`.

### 19. `start.sh` can stop a running container (Low)

`scripts/start.sh:29-31` (and `start.ps1:27-29`) call `wait_for_ready` on the current `PORT` when the container is already running. If it was started with a different `PORT`, the health check fails and the script stops the running app.

Action items:
- When the container is already running, report that and exit without the health check, or read its published port with `docker port`.

### 20. Uncovered backend error paths (Low)

Coverage is 92%. Uncovered lines include the 404 branches in `main.py` (73, 82, 85, 95, 118), the migration rollback and version checks in `database.py` (71, 81, 89-92, 96), and the empty-content check in `openrouter.py:114`. Several of these disappear with items 12, 13, and 14.

Action items:
- After those simplifications, add tests for the remaining branches (a newer-than-supported `user_version`, a failing migration, and an empty provider message).

## Test gaps

- A board edit saved after an AI update commits but before the client refreshes (item 1).
- Chat history and input after a failed or 409 chat request (item 3).
- Sign-in with non-ASCII credentials against the real backend (item 4).
- Deleting a card whose column changed before the queued update runs (item 5).
