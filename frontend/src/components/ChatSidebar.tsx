"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CHAT_HISTORY_STORAGE_KEY,
  isChatMessage,
  sendChatMessage,
  type ChatMessage,
} from "@/lib/chat-api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  authHeader: string;
  onBoardUpdated: () => Promise<BoardData>;
};

export const ChatSidebar = ({
  authHeader,
  onBoardUpdated,
}: ChatSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const closeChat = () => {
    setIsOpen(false);
    launcherRef.current?.focus();
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const stored = sessionStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMessages(parsed.filter(isChatMessage));
        }
      } catch {
        sessionStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      }
    }
    setHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (historyLoaded) {
      sessionStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(messages));
    }
  }, [historyLoaded, messages]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  }, [messages, isSending, isOpen]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || isSending || !historyLoaded) {
      return;
    }

    const previousMessages = messages;
    setMessages([...previousMessages, { role: "user", content: text }]);
    setQuestion("");
    setError("");
    setIsSending(true);

    try {
      const result = await sendChatMessage(
        authHeader,
        text,
        previousMessages.slice(-40)
      );
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.response },
      ]);
      if (result.board_updated) {
        await onBoardUpdated();
      }
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send your message."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-label="Open board chat"
        aria-expanded={isOpen}
        aria-controls="board-chat"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-white shadow-[var(--shadow)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--secondary-purple)]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z" />
          <path strokeLinecap="round" d="M7 10h10M7 14h6" />
        </svg>
      </button>
      <section
        id="board-chat"
        role="dialog"
        aria-labelledby="board-chat-title"
        hidden={!isOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            closeChat();
          }
        }}
        className={`${isOpen ? "flex" : "hidden"} fixed bottom-6 right-6 z-50 h-[min(640px,calc(100dvh-3rem))] w-[calc(100%-3rem)] max-w-[400px] flex-col overflow-hidden rounded-[28px] border border-[var(--stroke)] bg-white shadow-[var(--shadow)]`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--stroke)] px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              AI assistant
            </p>
            <h2 id="board-chat-title" className="mt-2 text-lg font-semibold text-[var(--navy-dark)]">
              Board chat
            </h2>
            <p className="mt-1 text-sm text-[var(--gray-text)]">
              Ask questions or request board changes.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close board chat"
            onClick={closeChat}
            className="shrink-0 rounded-full p-2 text-[var(--navy-dark)] transition hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--primary-blue)]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div
          ref={messageListRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [overflow-wrap:anywhere]"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.length === 0 && (
            <p className="rounded-2xl bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--gray-text)]">
              Ask about your board or request a card update.
            </p>
          )}
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "ml-auto bg-[var(--primary-blue)] text-white"
                  : "bg-[var(--surface)] text-[var(--navy-dark)]"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {message.role === "user" ? "You" : "Assistant"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
          {isSending && (
            <p role="status" className="text-sm text-[var(--gray-text)]">
              Assistant is thinking...
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="shrink-0 border-t border-[var(--stroke)] p-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <label className="sr-only" htmlFor="chat-question">
            Message the AI assistant
          </label>
          <textarea
            ref={inputRef}
            id="chat-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about your board..."
            rows={3}
            maxLength={2000}
            disabled={!historyLoaded || isSending}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--primary-blue)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!historyLoaded || isSending || !question.trim()}
            className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send message"}
          </button>
        </form>
      </section>
    </>
  );
};
