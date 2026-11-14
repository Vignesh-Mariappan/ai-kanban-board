import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatApiError, sendChatMessage } from "@/lib/chat-api";

afterEach(() => vi.unstubAllGlobals());

describe("chat API client", () => {
  it("sends the question and previous conversation with authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Done.", board_updated: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const history = [{ role: "user" as const, content: "Earlier question" }];

    await expect(
      sendChatMessage("Basic token", "Move this card", history)
    ).resolves.toEqual({ response: "Done.", board_updated: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic token",
      },
      body: JSON.stringify({ question: "Move this card", history }),
    });
  });

  it("reports API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ detail: "AI provider request failed" }),
      })
    );

    await expect(sendChatMessage("Basic token", "Help", [])).rejects.toMatchObject({
      name: "ChatApiError",
      message: "AI provider request failed",
      status: 502,
    } satisfies Partial<ChatApiError>);
  });
});
