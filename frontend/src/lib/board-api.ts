import type { BoardData } from "@/lib/kanban";

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

const requestBoard = async (
  authorization: string,
  init?: RequestInit
): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    let detail = `Board request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        detail = body.detail;
      }
    } catch {
      // Keep the status-based message for non-JSON responses.
    }
    throw new BoardApiError(detail, response.status);
  }

  return (await response.json()) as BoardData;
};

export const fetchBoard = (authorization: string) =>
  requestBoard(authorization);

export const saveBoard = (authorization: string, board: BoardData) =>
  requestBoard(authorization, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });