# Project Management MVP

Requires Docker.

Build the image from the project root:

```bash
docker build -t project-management-mvp .
```

Start the app with `./scripts/start.sh` on macOS/Linux or `./scripts/start.ps1` in PowerShell on Windows. The scripts use port 8000 by default; set `PORT` to use another host port. They wait for the health endpoint before reporting the app as available. The root `.env` is passed to the container when present and is excluded from the image. SQLite data persists in the host `data/` directory, mounted into the container.

Open `http://localhost:8000/`. The board API requires Basic credentials `user` / `password`; see [docs/API.md](docs/API.md) for its route contract.

Stop the app with `./scripts/stop.sh` on macOS/Linux or `./scripts/stop.ps1` in PowerShell on Windows.

To run the optional live OpenRouter connectivity check, set `OPENROUTER_API_KEY` in the environment or load it from `.env`, then run this from `backend/`:

```bash
RUN_OPENROUTER_SMOKE_TEST=1 uv run --env-file ../.env pytest -m openrouter
```