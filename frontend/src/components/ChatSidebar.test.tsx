import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { chatHistoryKey } from "@/lib/chat-api";
import { initialData } from "@/lib/kanban";

const renderChat = async (onBoardUpdated = vi.fn().mockResolvedValue(initialData)) => {
  const result = render(
    <ChatSidebar authHeader="Basic token" boardId="board-1" onBoardUpdated={onBoardUpdated} />
  );
  await userEvent.click(screen.getByRole("button", { name: "Open board chat" }));
  return result;
};

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("ChatSidebar", () => {
  it("starts closed, focuses the input on open, and preserves drafts when closed", async () => {
    const user = userEvent.setup();
    render(<ChatSidebar authHeader="Basic token" boardId="board-1" onBoardUpdated={vi.fn()} />);
    const launcher = screen.getByRole("button", { name: "Open board chat" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    await user.click(launcher);
    expect(screen.getByRole("dialog", { name: "Board chat" })).toBeVisible();
    const input = screen.getByLabelText("Message the AI assistant");
    expect(input).toHaveFocus();
    await user.type(input, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Close board chat" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
    await user.click(launcher);
    expect(screen.getByLabelText("Message the AI assistant")).toHaveValue("Keep this draft");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("sends a question, renders the response, and saves conversation in the tab", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "I can help with that.", board_updated: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const firstRender = await renderChat();

    const input = await screen.findByLabelText("Message the AI assistant");
    await user.type(input, "What should I prioritize?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I can help with that.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-1/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "What should I prioritize?",
          history: [],
        }),
      })
    );
    expect(JSON.parse(sessionStorage.getItem(chatHistoryKey("board-1")) ?? "[]")).toEqual([
      { role: "user", content: "What should I prioritize?" },
      { role: "assistant", content: "I can help with that." },
    ]);

    firstRender.unmount();
    await renderChat();
    expect(await screen.findByText("What should I prioritize?")).toBeInTheDocument();
    expect(screen.getByText("I can help with that.")).toBeInTheDocument();
  });

  it("shows pending status and disables submission while the request is active", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          })
      )
    );
    const user = userEvent.setup();
    await renderChat();

    await user.type(await screen.findByLabelText("Message the AI assistant"), "Help");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Assistant is thinking..."
    );
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close board chat" }));
    resolveResponse?.({
      ok: true,
      json: async () => ({ response: "Here is help.", board_updated: false }),
    } as Response);
    await user.click(screen.getByRole("button", { name: "Open board chat" }));
    expect(await screen.findByText("Here is help.")).toBeInTheDocument();
  });

  it("reports request errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("AI is unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    await renderChat();

    const input = await screen.findByLabelText("Message the AI assistant");
    await user.type(input, "Help");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AI is unavailable");
    expect(screen.getByText("Help")).toBeInTheDocument();
  });

  it("refreshes the saved board after a response applies a change", async () => {
    const onBoardUpdated = vi.fn().mockResolvedValue(initialData);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: "I moved the card.", board_updated: true }),
      })
    );
    const user = userEvent.setup();
    await renderChat(onBoardUpdated);

    await user.type(
      await screen.findByLabelText("Message the AI assistant"),
      "Move a card"
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("I moved the card.")).toBeInTheDocument();
    expect(onBoardUpdated).toHaveBeenCalledOnce();
  });
});
