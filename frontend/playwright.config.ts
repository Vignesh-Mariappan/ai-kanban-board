import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = process.env.PLAYWRIGHT_PORT ?? "8010";
const baseURL = `http://127.0.0.1:${port}`;
const databasePath = path.resolve(__dirname, "test-results", "playwright.sqlite3");

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `uv run --directory ../backend uvicorn test_app:app --host 127.0.0.1 --port ${port}`,
    env: { DATABASE_PATH: databasePath },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
