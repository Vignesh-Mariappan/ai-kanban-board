# Project Plan

## Delivery and quality gates

- Complete the parts in order. A checked item means its implementation and listed tests are complete; it does not waive an approval gate.
- After Part 1, pause for the user's review and approval before starting Part 2.
- After Part 5, pause for the user's approval of the proposed database schema and approach before starting Part 6.
- Keep changes focused on the current part. Update this plan as work is completed, and record any approved scope changes here.
- Prioritize tests for critical user flows, state transitions, and high-risk failures. Scale coverage to the change; there is no universal minimum percentage. Report coverage when useful, and exclude generated/framework bootstrap code from focused coverage reports.
- Keep integration tests separate from unit coverage. They must exercise real module boundaries with isolated test data, and must not require a live OpenRouter request.
- Use browser end-to-end tests for user workflows across the served frontend and backend. Tests must be repeatable, use a clean or disposable database, and avoid depending on external network services.
- Before calling a part complete, run its focused tests and relevant build/lint checks. Run the broader regression suite at the end of Parts 3, 7, and 10.

## Part 1: Plan and frontend handoff

- [x] Expand this plan into ordered implementation checklists, tests, and success criteria.
- [x] Add `frontend/AGENTS.md` describing the current frontend structure, behavior, and test commands.
- [x] User reviews and approves this plan before Part 2 begins.

Tests and review:
- Confirm the plan covers all ten parts, their approval gates, and test expectations.
- Confirm frontend guidance matches the current source tree and package scripts.

Success criteria:
- The plan is concrete enough to guide implementation without silently deciding the database design.
- The user has approved the plan; no scaffolding begins before that approval.

## Part 2: Docker and backend scaffolding

- [x] Inspect existing repository files and preserve the frontend demo and local environment configuration.
- [x] Add a minimal FastAPI application in `backend/`, managed with `uv` in the container.
- [x] Add a health/example API route and a minimal static HTML response for the initial container smoke test.
- [x] Add a Docker build that packages the app and runs it locally with configuration supplied through environment variables.
- [x] Add start and stop scripts for macOS, Windows, and Linux under `scripts/`, following each platform's conventions.
- [x] Document only the commands needed to build, start, inspect, and stop the local container.

Tests:
- [x] Backend endpoint tests: 3 passed; backend application line coverage is 100%.
- [x] POSIX script syntax check with `sh -n`.
- [x] Docker smoke test: build the image, start the container, request the HTML root and both API routes, then stop it. Both launchers wait for a successful health response before reporting availability; repeated start/stop was also checked.
- [x] Parse-check both PowerShell scripts and run their lifecycle flow with PowerShell 7 on macOS; a Windows host-specific run was not available.

Success criteria:
- A clean local Docker build starts successfully without a globally installed Python environment.
- The root serves the example HTML and the API route responds over HTTP.
- Start/stop scripts are idempotent enough to report a clear error or status when the container is already started or stopped.

## Part 3: Static frontend served by FastAPI

- [x] Configure the Next.js frontend for static output compatible with the selected FastAPI static-serving approach.
- [x] Serve the built frontend at `/` and ensure static assets resolve correctly from the packaged app.
- [x] Replace the Part 2 example root response with the existing Kanban demo, keeping the initial in-memory interactions intact.
- [x] Support editing an existing card's title and details in the in-memory demo.
- [x] Add or update frontend unit tests for board rendering, column rename, card creation/editing/deletion, and drag/drop behavior.
- [x] Add integration coverage for the production frontend build served by FastAPI, including page and asset requests.

Tests:
- [x] Frontend unit suite: 9 tests passed with 91.36% first-party line coverage (reported; not a universal requirement).
- [ ] Playwright smoke tests against the built, served app for board render, card add/edit/delete, column rename, and moving a card (skipped at the user's request).
- [x] User approved Part 3 with the Playwright run deferred.
- [x] Docker smoke test against the production image, not only the Next.js development server; root, APIs, and every referenced static asset returned successfully.
- [x] Run frontend lint, production build, and the focused backend serving tests; backend tests passed with 100% line coverage.

Success criteria:
- `/` displays the existing Kanban board when served from the container.
- Required JavaScript, CSS, and other static assets load without 404s.
- Browser verification of create, edit, delete, rename, and move interactions was deferred with user approval and remains unrun.

## Part 4: Fake sign-in and sign-out

- [x] Gate the board behind a sign-in screen using the MVP credentials `user` / `password`.
- [x] Provide a clear sign-out action that returns to the sign-in screen.
- [x] Keep this explicitly a local MVP sign-in experience; document that it is not production-grade authentication.
- [x] Persist the fake sign-in in `sessionStorage`, so it survives reloads in the same tab and clears on sign-out or tab close; do not add unrelated account features.

Tests:
- [x] Two focused unit tests cover rejected credentials, session restoration after remount, and sign-out.
- [x] Critical browser flow against the fresh Docker image covers invalid login, valid sign-in, same-tab reload restoration, and sign-out; the full Playwright CLI suite was not run.
- [x] Unit and browser checks verify board content is hidden while signed out.

Success criteria:
- Only the configured dummy credentials reveal the board.
- Signing out hides the board and returns the user to the sign-in view.
- Reload preserves sign-in within the same tab; closing the tab clears the session.

## Part 5: Database proposal and approval

- [x] Propose a JSON schema for users, a user's single board, ordered columns, and cards, including their identifiers and relationships.
- [x] Define how column and card order are represented and how one board per user is enforced.
- [x] Document the SQLite approach, database location/configuration, initialization behavior, and schema evolution approach in `docs/`.
- [x] Include representative example data and validation rules in the proposal.
- [x] Ask the user to review and approve the schema and database approach before Part 6.

Tests and review:
- [x] Parse both JSON files and validate the example against the Draft 2020-12 schema.
- [x] Check unique users/columns, single-board ownership, card ID equality, and card-to-column relationships in the example.
- [x] Review that the proposal supports the existing Kanban interactions and multiple users in the future.

Success criteria:
- [x] The schema and database approach are documented and internally consistent.
- [x] The user's approval is recorded before implementing database-backed routes.

## Part 6: Backend Kanban API and SQLite persistence

- [x] Initialize the SQLite database and required tables automatically when the app starts, applying ordered migrations and seeding only a missing board.
- [x] Implement authenticated API operations to read and replace the signed-in user's board, columns, and cards.
- [x] Validate request data and scope database access to the authenticated user.
- [x] Keep API responses and errors consistent and document the route contract.
- [x] Add backend unit tests and HTTP integration tests using a temporary SQLite database.
- [x] Mount host `data/` into Docker so SQLite changes persist across container replacement.

Tests:
- [x] Unit tests cover board relationship validation and order-preserving SQLite mapping.
- [x] Nine HTTP tests cover initialization, static/health routes, auth rejection, ordered board reads, board updates, invalid membership, and persistence across app restart.
- [x] Verify unauthorized usernames cannot read a board and SQLite enforces one board per user.
- [x] Docker and both start-script paths verified that API updates survive container stop/start through the host data mount.

Success criteria:
- [x] A new database is usable without a manual schema setup step.
- [x] API changes persist in SQLite and are scoped to the authenticated user.
- [x] Integration tests use disposable databases and do not touch a developer's local data.

## Part 7: Frontend backed by the API

- [x] Replace the demo's in-memory source of truth with the backend API for board reads and changes.
- [x] Connect sign-in/sign-out to the backend Basic-auth contract while retaining the MVP credentials.
- [x] Provide loading, empty-column, and recoverable load/save error states for API-backed board operations.
- [x] Ensure card moves, edits, additions, deletions, and column renames persist across reloads.
- [x] Keep API access and serialization logic in `frontend/src/lib/board-api.ts`.

Tests:
- [x] Focused frontend unit tests cover API auth/request serialization, sign-in rejection/session restore, successful board saves, and visible failed-save behavior (16 tests passed).
- [x] Backend suite passes (11 tests); browser integration against the fresh production image with an isolated SQLite volume covered invalid login, add/edit/rename/move, reload, sign-out, and fresh sign-in. The full Playwright CLI suite was not run.
- [x] Run frontend lint, static production build, backend tests, and rebuild/start the production Docker image.

Success criteria:
- [x] The UI displays backend data and supported board changes persist after reload and fresh sign-in.
- [x] API failures are surfaced; failed updates do not silently alter the displayed board.
- [x] Browser checks proved the UI-to-API-to-SQLite path against an isolated database.

## Part 8: OpenRouter connectivity

- [x] Add a small backend OpenRouter client configured with `OPENROUTER_API_KEY` from the environment and model `openai/gpt-oss-120b`.
- [x] Keep secrets out of source, logs, test fixtures, and client-side bundles.
- [x] Add an opt-in pytest connectivity check that sends `2+2` and verifies the returned answer.
- [x] Stub the provider for regular unit and integration tests so they are deterministic and require no network access.

Tests:
- [x] Unit tests for request construction, successful responses, provider failures, and missing configuration using a mocked HTTP client.
- [ ] Run the opt-in/manual smoke test against OpenRouter to verify the configured model answers `2+2`.

Success criteria:
- [ ] The configured model can be reached with a valid key, and the smoke test confirms a correct answer.
- [x] Automated test runs remain usable without a key or external network access.

## Part 9: Board-aware AI response contract

- [x] Define a structured response schema containing a user-facing response and an optional validated Kanban update.
- [x] Send the authenticated user's persisted board JSON, question, and conversation history to the backend AI service on every chat request.
- [x] Validate model output before applying any board update; preserve the board when output is absent or invalid.
- [x] Keep provider-specific request formatting behind the OpenRouter client and chat parsing/validation in the chat service.

Tests:
- [x] Unit tests cover prompt construction, response parsing, schema validation, and valid/invalid board updates.
- [x] Integration tests with a mocked provider cover board context, conversation history, user-facing text, optional updates, and provider/schema failures.
- [x] Verify unauthenticated and unauthorized usernames cannot invoke the provider or include board data in a prompt; the MVP has one hardcoded user.

Success criteria:
- [x] Responses conform to the structured contract and any accepted update is valid for the authenticated user's board.
- [x] Invalid or failed AI output never mutates persisted board data.
- [x] Automated tests make no real model calls.

## Part 10: AI chat sidebar and full application integration

Approved UI follow-up: replace the sidebar with a bottom-right chat launcher and closable overlay, keep the board full-width, and place card actions below the title and description.
Verified with 23 frontend unit tests, 10 browser tests using installed Chrome (including 390-2100px layout checks), lint, TypeScript, and a production Docker build/restart.

- [x] Add an AI chat sidebar consistent with the existing frontend and usable alongside the board.
- [x] Send the user's question and conversation context through the backend chat API.
- [x] Render assistant responses and relevant loading/error states.
- [x] Apply valid board updates returned by the backend and refresh the board from its persisted source of truth.
- [x] Keep chat history scoped to the signed-in browser tab in `sessionStorage`; reloads retain it, sign-out and tab close clear it, and SQLite does not store it.

Tests:
- [x] Component tests cover chat input, message rendering, pending/error states, tab history restoration, and board refresh after an update.
- [x] Full-stack browser tests cover normal responses, AI-created/edited/moved cards, no-op responses, provider errors, and updates/history after reload with a deterministic mocked AI provider.
- [x] Run focused backend/frontend tests, Playwright, frontend lint, and a production frontend build.
- [ ] Run a clean production Docker build/start smoke test; Docker is unavailable in this environment.

Success criteria:
- [x] The user can chat from the sidebar and see validated board updates without manually reloading.
- [x] Updates persist and remain visible after reload; errors do not corrupt the board or lose the conversation response.
- [x] The full test suite is repeatable without OpenRouter credentials or network access.