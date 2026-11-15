"use client";

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { KanbanBoard } from "@/components/KanbanBoard";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import {
  SELECTED_BOARD_STORAGE_KEY,
  createBoard,
  deleteBoard,
  fetchBoard,
  renameBoard,
  type BoardSummary,
} from "@/lib/board-api";
import { chatHistoryKey } from "@/lib/chat-api";
import type { BoardData } from "@/lib/kanban";

type BoardWorkspaceProps = {
  authHeader: string;
  initialBoards: BoardSummary[];
};

type BoardForm = { mode: "create" | "rename"; name: string };

const pickBoardId = (boards: BoardSummary[], preferredId: string | null) =>
  boards.find((board) => board.id === preferredId)?.id ?? boards[0]?.id ?? null;

export const BoardWorkspace = ({ authHeader, initialBoards }: BoardWorkspaceProps) => {
  const [boards, setBoards] = useState(initialBoards);
  const [selectedId, setSelectedId] = useState(() =>
    pickBoardId(initialBoards, sessionStorage.getItem(SELECTED_BOARD_STORAGE_KEY))
  );
  const [loaded, setLoaded] = useState<{
    boardId: string;
    board?: BoardData;
    error?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [form, setForm] = useState<BoardForm | null>(null);
  const [actionError, setActionError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const selectedBoard = boards.find((board) => board.id === selectedId);

  useEffect(() => {
    if (!selectedId) {
      sessionStorage.removeItem(SELECTED_BOARD_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(SELECTED_BOARD_STORAGE_KEY, selectedId);

    let active = true;
    fetchBoard(authHeader, selectedId)
      .then((board) => {
        if (active) {
          setLoaded({ boardId: selectedId, board });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoaded({
            boardId: selectedId,
            error: error instanceof Error ? error.message : "Unable to load this board.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [authHeader, selectedId, retryCount]);

  const runAction = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The board action failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) {
      return;
    }
    const name = form.name.trim();
    void runAction(async () => {
      if (form.mode === "create") {
        const board = await createBoard(authHeader, name);
        setBoards((current) => [...current, board]);
        setSelectedId(board.id);
      } else if (selectedId) {
        const board = await renameBoard(authHeader, selectedId, name);
        setBoards((current) =>
          current.map((item) => (item.id === board.id ? board : item))
        );
      }
      setForm(null);
    });
  };

  const handleDelete = () => {
    if (
      !selectedBoard ||
      !window.confirm(`Delete "${selectedBoard.name}" and all of its cards?`)
    ) {
      return;
    }
    void runAction(async () => {
      await deleteBoard(authHeader, selectedBoard.id);
      sessionStorage.removeItem(chatHistoryKey(selectedBoard.id));
      const remaining = boards.filter((board) => board.id !== selectedBoard.id);
      setBoards(remaining);
      setSelectedId(pickBoardId(remaining, null));
      setForm(null);
    });
  };

  const isLoaded = loaded?.boardId === selectedId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke)] bg-[var(--surface)] px-4 py-2 sm:px-6">
        <nav aria-label="Boards" className="scrollbar-thin flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              aria-current={board.id === selectedId ? "page" : undefined}
              onClick={() => {
                setSelectedId(board.id);
                setForm(null);
                setActionError("");
              }}
              className={clsx(
                "max-w-[220px] shrink-0 truncate rounded-full border px-4 py-1.5 text-sm font-semibold transition",
                board.id === selectedId
                  ? "border-[var(--primary-blue)] bg-[var(--surface-raised)] text-[var(--text)]"
                  : "border-transparent text-[var(--gray-text)] hover:border-[var(--stroke-strong)] hover:text-[var(--text)]"
              )}
            >
              {board.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setForm({ mode: "create", name: "" })}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--stroke-strong)] px-4 py-1.5 text-sm font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
          >
            <PlusIcon />
            New board
          </button>
        </nav>
        {selectedBoard && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Rename board"
              title="Rename board"
              onClick={() => setForm({ mode: "rename", name: selectedBoard.name })}
              className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              aria-label="Delete board"
              title="Delete board"
              onClick={handleDelete}
              disabled={isBusy}
              className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface-raised)] hover:text-red-400 disabled:opacity-50"
            >
              <TrashIcon />
            </button>
          </div>
        )}
        {form && (
          <form onSubmit={handleSubmitForm} className="flex w-full flex-wrap items-center gap-2 pb-1">
            <input
              autoFocus
              aria-label="Board name"
              placeholder="Board name"
              value={form.name}
              maxLength={80}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setForm(null);
                }
              }}
              className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--primary-blue)] sm:max-w-sm"
              required
            />
            <button
              type="submit"
              disabled={isBusy || !form.name.trim()}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {form.mode === "create" ? "Create board" : "Save name"}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-full border border-[var(--stroke-strong)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Cancel
            </button>
          </form>
        )}
        {actionError && (
          <p role="alert" className="w-full text-sm text-red-400">
            {actionError}
          </p>
        )}
      </div>

      {!selectedBoard ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="text-sm text-[var(--gray-text)]">
            You have no boards yet. Use New board to create one.
          </p>
        </div>
      ) : !isLoaded ? (
        <div className="flex flex-1 items-center justify-center">
          <p role="status" className="text-sm text-[var(--gray-text)]">
            Loading board...
          </p>
        </div>
      ) : loaded.error || !loaded.board ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p role="alert" className="text-sm text-red-400">
            Unable to load this board: {loaded.error}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoaded(null);
              setRetryCount((count) => count + 1);
            }}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <KanbanBoard
          key={selectedBoard.id}
          initialBoard={loaded.board}
          title={selectedBoard.name}
          api={{ authHeader, boardId: selectedBoard.id }}
        />
      )}
    </div>
  );
};
