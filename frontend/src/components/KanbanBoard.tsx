"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { fetchBoard, saveBoard } from "@/lib/board-api";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  initialBoard?: BoardData;
  authHeader?: string;
};

type BoardUpdate = (board: BoardData) => BoardData;

export const KanbanBoard = ({
  initialBoard = initialData,
  authHeader,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialBoard);
  const boardRef = useRef(board);
  const writeQueue = useRef(Promise.resolve());
  const pendingWrites = useRef(0);
  const saveErrorRef = useRef("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const updateBoard = (update: BoardUpdate) => {
    if (!authHeader) {
      const nextBoard = update(boardRef.current);
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      return;
    }

    pendingWrites.current += 1;
    setSaveStatus("saving");
    writeQueue.current = writeQueue.current.then(async () => {
      const nextBoard = update(boardRef.current);
      try {
        const savedBoard = await saveBoard(authHeader, nextBoard);
        boardRef.current = savedBoard;
        setBoard(savedBoard);
      } catch (error) {
        saveErrorRef.current =
          error instanceof Error ? error.message : "Unable to save board changes.";
        setSaveError(saveErrorRef.current);
      } finally {
        pendingWrites.current -= 1;
        setSaveStatus(
          pendingWrites.current > 0
            ? "saving"
            : saveErrorRef.current
              ? "error"
              : "saved"
        );
      }
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  const handleEditCard = (cardId: string, title: string, details: string) => {
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...prev.cards[cardId], title, details },
      },
    }));
  };

  const refreshBoard = async () => {
    if (!authHeader) {
      return boardRef.current;
    }

    const refresh = writeQueue.current.then(async () => {
      try {
        const latestBoard = await fetchBoard(authHeader);
        boardRef.current = latestBoard;
        setBoard(latestBoard);
        saveErrorRef.current = "";
        setSaveError("");
        setSaveStatus("saved");
        return latestBoard;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to refresh the board.";
        saveErrorRef.current = message;
        setSaveError(message);
        setSaveStatus("error");
        throw error;
      }
    });
    writeQueue.current = refresh.then(
      () => undefined,
      () => undefined
    );
    return refresh;
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative min-h-screen w-full px-6 pb-24 pt-12">
        <section className="flex min-w-0 flex-col gap-10">
          <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                  Single Board Kanban
                </p>
                <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                  Kanban Studio
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                  Keep momentum visible. Rename columns, drag cards between stages,
                  and capture quick notes without getting buried in settings.
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {board.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                  {column.title}
                </div>
              ))}
            </div>
          </header>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onEditCard={handleEditCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {authHeader && (
            <div className="min-h-6 text-sm" aria-live="polite">
              {saveStatus === "saving" && (
                <p role="status" className="text-[var(--gray-text)]">
                  Saving changes...
                </p>
              )}
              {saveStatus === "saved" && !saveError && (
                <p role="status" className="text-green-800">
                  Changes saved
                </p>
              )}
              {saveError && (
                <p role="alert" className="flex items-center gap-3 text-red-700">
                  <span>Could not save the latest board changes: {saveError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      saveErrorRef.current = "";
                      setSaveError("");
                      setSaveStatus("idle");
                    }}
                    className="font-semibold underline"
                  >
                    Dismiss
                  </button>
                </p>
              )}
            </div>
          )}
        </section>
      </main>
      {authHeader && (
        <ChatSidebar authHeader={authHeader} onBoardUpdated={refreshBoard} />
      )}
    </div>
  );
};
