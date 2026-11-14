# Backend Guidance

The backend is a FastAPI application managed with `uv`. The app in `app/main.py` serves the exported frontend at `/`; authenticated board operations use `app/database.py` and normalized SQLite tables. `POST /api/chat` loads that user's saved board, validates structured AI output through `app/chat.py`, and persists valid full-board updates. `/api/health` is public. The Docker image builds the frontend, installs locked production dependencies, and runs Uvicorn on port 8000 with `/data` mounted for SQLite persistence.

Keep API behavior in the FastAPI app or focused backend modules. Read the root `AGENTS.md` and `docs/PLAN.md` before backend changes.

From `backend/`, install development dependencies and run the test suite with:

```bash
uv sync --group dev
uv run python -m pytest
```

Focus tests on critical endpoint behavior and state transitions. Use `TestClient` with temporary SQLite databases for HTTP-level tests and keep external services out of automated tests; the Playwright server uses `test_app.py` to inject a deterministic AI provider. No universal coverage percentage is required. The Basic credentials are a local MVP gate, not production authentication.