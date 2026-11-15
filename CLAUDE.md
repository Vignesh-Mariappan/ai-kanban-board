# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` (business requirements, tech decisions, color scheme, coding standards) and `docs/PLAN.md` (part-by-part plan with user approval gates) before making changes. `backend/AGENTS.md`, `frontend/AGENTS.md`, and `scripts/AGENTS.md` hold area-specific guidance. Key standards: keep it simple, no over-engineering or unnecessary defensive code, minimal README, no emojis, and prove the root cause with evidence before fixing an issue.

## Commands

Backend (run from `backend/`, managed with `uv`):

```bash
uv sync --group dev
uv run python -m pytest                                   # full suite with coverage
uv run python -m pytest tests/test_chat.py::test_name     # single test
RUN_OPENROUTER_SMOKE_TEST=1 uv run --env-file ../.env pytest -m openrouter   # opt-in live OpenRouter check
```

Frontend (run from `frontend/`):

```bash
npm run dev
npm run test:unit                       # Vitest + coverage
npx vitest run src/lib/kanban.test.ts   # single unit test file
npm run test:e2e                        # builds static export, then Playwright
npx playwright test tests/kanban.spec.ts -g "name"   # single e2e test (run npm run build first)
npm run lint
npm run build                           # static export to out/
```

Docker (from repo root):

```bash
docker build -t project-management-mvp .
./scripts/start.sh    # or scripts/start.ps1; PORT overrides host port 8000
./scripts/stop.sh     # or scripts/stop.ps1
```

## Architecture

Single container: a multi-stage `Dockerfile` builds the Next.js app as a static export (`output: "export"`), then FastAPI serves `frontend/out` at `/` alongside the `/api/*` routes. Uvicorn listens on port 8000; host `data/` is mounted at `/data` for the SQLite file. The root `.env` (holding `OPENROUTER_API_KEY`) is passed at runtime, never baked into the image.

Backend (`backend/app/`):
- `main.py`: `create_app(database_path, seed_path, frontend_static_dir, chat_provider)` factory. Defaults come from env vars `DATABASE_PATH`, `KANBAN_SEED_PATH`, `FRONTEND_STATIC_DIR`. The lifespan hook initializes the DB. Auth is HTTP Basic verified against the `users` table (scrypt hashes in `passwords.py`); `POST /api/users` registers. The demo user `user` / `password` is seeded on startup (local MVP only).
- `database.py`: normalized SQLite tables. Migrations are ordered `backend/migrations/*.sql` files tracked via `PRAGMA user_version`. Users own many boards. A newly seeded demo user gets `docs/kanban-board.example.json`; registered users and new boards start empty. All board routes are `/api/boards/{board_id}` and check ownership; `PUT` replaces the whole board transactionally.
- `schemas.py`: Pydantic `BoardData` validation (exactly five fixed column IDs, every card in exactly one column, card map keys match IDs). Mirrors `docs/kanban-board.schema.json`.
- `openrouter.py`: OpenRouter client (model `openai/gpt-oss-120b`), with optional custom CA bundle (`data/openrouter-ca.pem` or `OPENROUTER_CA_BUNDLE`).
- `chat.py`: builds the prompt from the user's saved board, question, and history; parses structured output `{response, board_update?}`. A valid `board_update` is a complete board that gets saved; invalid output returns 502 and never mutates the board.

The chat provider is injectable through the `ChatProvider` protocol. Automated tests must never call OpenRouter: unit tests mock it, and `backend/test_app.py` is the Playwright server app with a deterministic fake provider keyed on phrases in the question (e.g. "create e2e card"). Playwright starts it via `uv run --directory ../backend uvicorn test_app:app` on port 8010 with a disposable DB at `frontend/test-results/playwright.sqlite3`.

Frontend (`frontend/src/`):
- `components/SignInGate.tsx`: sign-in and create-account screen; stores the Basic auth header in `sessionStorage` (tab-scoped) and loads the board list.
- `components/BoardWorkspace.tsx`: board tabs, create/rename/delete, remembers the selected board in `sessionStorage`, and renders `KanbanBoard` keyed by board ID.
- `components/KanbanBoard.tsx`: owns board state and a serialized save queue; every change PUTs the full board via `lib/board-api.ts`. Failed saves are surfaced and do not silently alter the displayed board.
- `components/ChatSidebar.tsx`: bottom-right chat launcher and overlay; history lives in `sessionStorage` per board (not SQLite) and the board refreshes from the API after an AI update.
- `lib/kanban.ts`: board types and move logic (drag and drop via `@dnd-kit`).

API contract details are in `docs/API.md`; the DB design is in `docs/DATABASE.md`.
