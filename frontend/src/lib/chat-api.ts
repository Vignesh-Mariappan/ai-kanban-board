import { chatPath, errorDetail, jsonBody } from "@/lib/board-api";

const CHAT_HISTORY_STORAGE_KEY = "kanban-mvp-chat-history";

export const chatHistoryKey = (boardId: string) =>
  `${CHAT_HISTORY_STORAGE_KEY}:${boardId}`;

export const clearChatHistories = () => {
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(CHAT_HISTORY_STORAGE_KEY))
    .forEach((key) => sessionStorage.removeItem(key));
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  response: string;
  board_updated: boolean;
};

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export const sendChatMessage = async (
  authorization: string,
  boardId: string,
  question: string,
  history: ChatMessage[]
): Promise<ChatResult> => {
  const response = await fetch(
    chatPath(boardId),
    jsonBody("POST", { question, history }, authorization)
  );

  if (!response.ok) {
    const detail = await errorDetail(response, `Chat request failed (${response.status}).`);
    throw new ChatApiError(detail, response.status);
  }

  return (await response.json()) as ChatResult;
};

export const isChatMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
};
