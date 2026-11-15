# Frontend Guidance

## Current application

This is a Next.js App Router application using React, TypeScript, and Tailwind CSS. The root page renders a static-exportable multi-board Kanban app behind a sign-in gate. Users can create an account or use the demo `user` / `password`; a Basic authorization header is stored in `sessionStorage` for the current tab. `src/components/BoardWorkspace.tsx` lists the user's boards and handles create, rename, delete, and switching. Boards load and save through `src/lib/board-api.ts`; FastAPI persists them in SQLite. The AI chat sidebar uses `src/lib/chat-api.ts`, keeps tab-scoped conversation history per board, and refreshes the board after an AI update. `npm run build` writes the static site to `out/`, which FastAPI serves from `/`.

The board has five columns. Users can rename columns, add, edit, and remove cards, and drag cards within or between columns. The board state and serialized save queue are in `src/components/KanbanBoard.tsx`; reusable column, card, preview, and form UI live in `src/components/`. API request/response handling is in `src/lib/board-api.ts`; board types, sample data, card ID helper, and movement logic are in `src/lib/kanban.ts`.

## Project layout

- `src/app/`: App Router page, root layout, global styles, metadata, and fonts.
- `src/components/`: Kanban board, chat sidebar, and related UI components.
- `src/lib/`: Kanban model, board API, and chat API clients.
- `src/test/`: Vitest setup and test type declarations.
- `tests/`: Playwright browser tests.
- `vitest.config.ts`: jsdom unit/component test configuration and `@/` alias.
- `playwright.config.ts`: Chromium tests using the Next.js development server at port 3000.

Use the existing `@/` import alias and keep changes focused on the relevant component or library module. Follow the repository's root `AGENTS.md` for general project requirements.

## Tests and checks

Run commands from `frontend/`:

```bash
npm run test:unit
npm run test:e2e
npm run test:all
npm run lint
npm run build
```

Unit and component tests use Vitest, jsdom, and Testing Library. Focus tests on critical user flows and state transitions; coverage is reported without a universal percentage threshold. Browser tests use Playwright against the built export served by FastAPI with an isolated SQLite database and require `uv`. Keep browser/integration tests deterministic and independent of OpenRouter credentials or live network access.