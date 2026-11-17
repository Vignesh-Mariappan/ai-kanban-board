import type { BoardData } from "@/lib/kanban";

export const SELECTED_BOARD_STORAGE_KEY = "kanban-mvp-board";

export type BoardSummary = {
  id: string;
  name: string;
};

export class BoardApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "BoardApiError";
  }
}

export const createBasicAuthHeader = (username: string, password: string) => {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
};

export const usernameFromAuthHeader = (authorization: string) => {
  const bytes = Uint8Array.from(atob(authorization.slice("Basic ".length)), (char) =>
    char.charCodeAt(0)
  );
  return new TextDecoder().decode(bytes).split(":")[0];
};

export const errorDetail = async (response: Response, fallback: string) => {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // Keep the status-based message for non-JSON responses.
  }
  return fallback;
};

export const jsonBody = (method: string, body: unknown, authorization?: string) => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(authorization && { Authorization: authorization }),
  },
  body: JSON.stringify(body),
});

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, init);

  if (!response.ok) {
    const detail = await errorDetail(response, `Request failed (${response.status}).`);
    throw new BoardApiError(detail, response.status);
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
};

const boardPath = (boardId: string) => `/api/boards/${encodeURIComponent(boardId)}`;

export const registerUser = (username: string, password: string) =>
  request<{ username: string }>("/api/users", jsonBody("POST", { username, password }));

export const fetchBoards = (authorization: string) =>
  request<BoardSummary[]>("/api/boards", { headers: { Authorization: authorization } });

export const createBoard = (authorization: string, name: string) =>
  request<BoardSummary>("/api/boards", jsonBody("POST", { name }, authorization));

export const renameBoard = (authorization: string, boardId: string, name: string) =>
  request<BoardSummary>(boardPath(boardId), jsonBody("PATCH", { name }, authorization));

export const deleteBoard = (authorization: string, boardId: string) =>
  request<void>(boardPath(boardId), {
    method: "DELETE",
    headers: { Authorization: authorization },
  });

export const fetchBoard = (authorization: string, boardId: string) =>
  request<BoardData>(boardPath(boardId), { headers: { Authorization: authorization } });

export const saveBoard = (authorization: string, boardId: string, board: BoardData) =>
  request<BoardData>(boardPath(boardId), jsonBody("PUT", board, authorization));

export const chatPath = (boardId: string) => `${boardPath(boardId)}/chat`;
