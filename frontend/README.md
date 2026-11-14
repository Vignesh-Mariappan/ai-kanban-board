# Kanban Studio

## Run

```bash
npm install
npm run dev
```

`npm run build` creates the static export in `out/`. The FastAPI app serves this export at `/` in the packaged application.

The local MVP sign-in uses username `user` and password `password` with the FastAPI board API. The Basic authorization header is kept in `sessionStorage` for the current tab and cleared on sign-out or tab close. This is not production authentication.

The board loads from SQLite through FastAPI. Card and column changes are saved before the UI reports success; the UI shows an error if a save fails. SQLite data persists in the repository's `data/` directory when using the Docker start scripts.

The board uses the full viewport width. Open AI chat using the floating bottom-right button; its window overlays the board without resizing it. Close it with the close button or Escape. Closing chat preserves the current draft and conversation.

## Tests

```bash
npm run test:unit
npm run test:e2e
```

Unit tests focus on critical board, API-client, and sign-in flows; coverage is reported without a universal percentage threshold. End-to-end tests build the export and run it through FastAPI with a disposable SQLite database; they require `uv` and use port 8010 by default (`PLAYWRIGHT_PORT` can override it).
