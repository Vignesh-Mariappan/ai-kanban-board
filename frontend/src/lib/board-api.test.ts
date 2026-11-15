import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BoardApiError,
  createBasicAuthHeader,
  createBoard,
  deleteBoard,
  fetchBoard,
  fetchBoards,
  registerUser,
  renameBoard,
  saveBoard,
  usernameFromAuthHeader,
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

const jsonRequest = (method: string, body: unknown, authorization?: string) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(authorization && { Authorization: authorization }),
  },
  body: JSON.stringify(body),
});

afterEach(() => vi.unstubAllGlobals());

describe("board API client", () => {
  it("creates the Basic authorization header", () => {
    expect(createBasicAuthHeader("user", "password")).toBe(
      "Basic dXNlcjpwYXNzd29yZA=="
    );
  });

  it("encodes non-Latin-1 credentials as UTF-8", () => {
    expect(createBasicAuthHeader("Łukasz", "pw")).toBe("Basic xYF1a2Fzejpwdw==");
  });

  it("reads the username back from the authorization header", () => {
    expect(usernameFromAuthHeader(createBasicAuthHeader("Łukasz", "pa:ss"))).toBe("Łukasz");
  });

  it("loads boards and a board with authorization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: "b1", name: "One" }] })
      .mockResolvedValueOnce({ ok: true, json: async () => board });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBoards("Basic token")).resolves.toEqual([{ id: "b1", name: "One" }]);
    await expect(fetchBoard("Basic token", "b1")).resolves.toEqual(board);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/boards", {
      headers: { Authorization: "Basic token" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/boards/b1", {
      headers: { Authorization: "Basic token" },
    });
  });

  it("registers users and creates, renames, and deletes boards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ username: "alice" }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "b2", name: "Two" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "b2", name: "2" }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    await registerUser("alice", "secret-pass");
    await expect(createBoard("Basic token", "Two")).resolves.toEqual({ id: "b2", name: "Two" });
    await renameBoard("Basic token", "b2", "2");
    await expect(deleteBoard("Basic token", "b2")).resolves.toBeUndefined();

    expect(fetchMock.mock.calls).toEqual([
      ["/api/users", jsonRequest("POST", { username: "alice", password: "secret-pass" })],
      ["/api/boards", jsonRequest("POST", { name: "Two" }, "Basic token")],
      ["/api/boards/b2", jsonRequest("PATCH", { name: "2" }, "Basic token")],
      ["/api/boards/b2", { method: "DELETE", headers: { Authorization: "Basic token" } }],
    ]);
  });

  it("saves the full board and reports API errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => board })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Invalid username or password" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ detail: [{ msg: "invalid" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await saveBoard("Basic token", "b1", board);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/boards/b1",
      jsonRequest("PUT", board, "Basic token")
    );
    await expect(fetchBoard("Basic token", "b1")).rejects.toMatchObject({
      name: "BoardApiError",
      message: "Invalid username or password",
      status: 401,
    } satisfies Partial<BoardApiError>);
    await expect(registerUser("a", "b")).rejects.toMatchObject({
      message: "Request failed (422).",
      status: 422,
    });
  });
});
