import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
};

test("rejects invalid credentials without showing the board", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("wrong");
  await page.getByLabel("Password").fill("credentials");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Incorrect username or password.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog")).toHaveCount(0);
});

test("restores a signed-in session after reload and signs out", async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("column-col-backlog")).toHaveCount(0);
});

test("loads the kanban board", async ({ page }) => {
  const assetStatuses: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/_next/static/")) {
      assetStatuses.push(response.status());
    }
  });

  await signIn(page);
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect.poll(() => assetStatuses.length).toBeGreaterThan(0);
  expect(assetStatuses.every((status) => status === 200)).toBe(true);
});

test("adds, edits, and deletes a card", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();

  const foundCard = firstColumn
    .getByTestId(/^card-/)
    .filter({ hasText: "Playwright card" });
  const cardId = await foundCard.getAttribute("data-testid");
  if (!cardId) {
    throw new Error("Unable to resolve the created card.");
  }
  const card = firstColumn.getByTestId(cardId);
  await card.getByRole("button", { name: "Edit Playwright card" }).click();
  await card.getByLabel("Edit card title").fill("Edited Playwright card");
  await card.getByLabel("Edit card details").fill("Edited details.");
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(card.getByText("Edited details.")).toBeVisible();

  await card.getByRole("button", { name: "Delete Edited Playwright card" }).click();
  await expect(firstColumn.getByText("Edited Playwright card")).toHaveCount(0);
});

test("renames a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByLabel("Column title").fill("Renamed backlog");
  await firstColumn.getByLabel("Column title").press("Enter");
  await expect(firstColumn.getByLabel("Column title")).toHaveValue("Renamed backlog");
});

test("moves a card between columns", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("persists a card edit through reload and a fresh sign-in", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: "Edit Align roadmap themes" }).click();
  await card.getByLabel("Edit card title").fill("Persisted roadmap update");
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Persisted roadmap update")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await signIn(page);
  await expect(page.getByText("Persisted roadmap update")).toBeVisible();
});

test("creates, edits, moves, and retains AI conversation through reload", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Open board chat" }).click();
  const chatInput = page.getByLabel("Message the AI assistant");
  const send = async (question: string, response: string) => {
    await chatInput.fill(question);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(response)).toBeVisible();
  };

  await send("Create e2e card", "I created the card.");
  await expect(page.getByText("AI-created card")).toBeVisible();
  await send("Edit e2e card", "I updated the card.");
  await expect(page.getByText("AI-edited card")).toBeVisible();
  await send("Move e2e card", "I moved the card.");
  await expect(
    page.getByTestId("column-col-progress").getByText("AI-edited card")
  ).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-col-progress").getByText("AI-edited card")).toBeVisible();
  await page.getByRole("button", { name: "Open board chat" }).click();
  await expect(page.getByText("I moved the card.")).toBeVisible();
});

test("shows a no-op response and a recoverable provider error", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Open board chat" }).click();
  const chatInput = page.getByLabel("Message the AI assistant");
  await chatInput.fill("Any suggestions?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Your board looks good.")).toBeVisible();

  await chatInput.fill("Trigger provider error");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("AI provider request failed")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog")).toBeVisible();
});

test("keeps card actions below text and chat floating without resizing the board", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /^Edit / }).click();
  await card.getByLabel("Edit card title").fill("A".repeat(100));
  await card.getByLabel("Edit card details").fill("Details".repeat(60));
  await card.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();

  for (const width of [1100, 1440, 2100, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const board = page.getByRole("main");
    const before = await board.boundingBox();
    expect(before?.width).toBe(width);
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(width);

    for (const item of await page.locator('article[data-testid^="card-"]').all()) {
      const bounds = await item.boundingBox();
      const details = await item.locator("p").boundingBox();
      expect(bounds).not.toBeNull();
      expect(details).not.toBeNull();
      for (const action of await item.getByRole("button", { name: /^(Edit|Delete) / }).all()) {
        const button = await action.boundingBox();
        expect(button).not.toBeNull();
        expect(button!.y).toBeGreaterThanOrEqual(details!.y + details!.height);
        expect(button!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(button!.x + button!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      }
    }

    const launcher = page.getByRole("button", { name: "Open board chat" });
    await launcher.click();
    const chat = page.getByRole("dialog", { name: "Board chat" });
    await expect(chat).toBeVisible();
    expect(await board.boundingBox()).toEqual(before);
    const chatBox = await chat.boundingBox();
    expect(chatBox!.x).toBeGreaterThanOrEqual(0);
    expect(chatBox!.y).toBeGreaterThanOrEqual(0);
    expect(chatBox!.x + chatBox!.width).toBe(width - 24);
    expect(chatBox!.y + chatBox!.height).toBe(800 - 24);
    expect(await chat.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await expect(page.getByLabel("Message the AI assistant")).toBeFocused();
    await page.getByRole("button", { name: "Close board chat" }).click();
    await expect(chat).toBeHidden();
    await expect(launcher).toBeFocused();
  }
});

test("lays columns out in one horizontal row that scrolls inside the board", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await signIn(page);
  const columns = await page.locator('[data-testid^="column-"]').all();
  const tops = await Promise.all(columns.map(async (column) => (await column.boundingBox())!.y));
  expect(new Set(tops).size).toBe(1);

  const row = page.getByRole("region", { name: "Board columns" });
  const { scrollWidth, clientWidth } = await row.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBe(900);
});
