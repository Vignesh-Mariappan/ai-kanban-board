import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BoardApiError,
  createBasicAuthHeader,
  fetchBoard,
  saveBoard,
} from "@/lib/board-api";

const board = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-discovery", title: "Discovery", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: { "card-1": { id: "card-1", title: "Task", details: "Notes" } },
};

afterEach(() => vi.unstubAllGlobals());

describe("board API client", () => {
  it("creates the Basic authorization header", () => {
    expect(createBasicAuthHeader("user", "password")).toBe(
      "Basic dXNlcjpwYXNzd29yZA=="
    );
  });

  it("loads a board with authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => board,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBoard("Basic token")).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenCalledWith("/api/board", {
      headers: { Authorization: "Basic token" },
    });
  });

  it("saves the full board and reports API errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => board })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Invalid username or password" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await saveBoard("Basic token", board);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/board", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic token",
      },
      body: JSON.stringify(board),
    });
    await expect(fetchBoard("Basic token")).rejects.toMatchObject({
      name: "BoardApiError",
      message: "Invalid username or password",
      status: 401,
    } satisfies Partial<BoardApiError>);
  });
});