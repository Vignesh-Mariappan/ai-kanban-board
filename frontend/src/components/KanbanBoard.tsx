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
import { CheckIcon } from "@/components/icons";
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

  const cardCount = Object.keys(board.cards).length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[480px] w-[480px] -translate-x-1/3 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.14)_0%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[560px] w-[560px] translate-x-1/4 translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.16)_0%,_transparent_70%)]" />

      <main className="relative flex min-h-0 w-full flex-1 flex-col gap-4 px-4 pb-24 pt-5 sm:px-6">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
              Project board
            </h1>
            <p className="mt-1 text-sm text-[var(--gray-text)]">
              {cardCount} cards across {board.columns.length} columns. Drag cards between stages.
            </p>
          </div>
          {authHeader && (
            <div className="min-h-6 text-sm" aria-live="polite">
              {saveStatus === "saving" && (
                <p role="status" className="text-[var(--gray-text)]">
                  Saving changes...
                </p>
              )}
              {saveStatus === "saved" && !saveError && (
                <p role="status" className="flex items-center gap-1.5 text-emerald-400">
                  <CheckIcon />
                  Changes saved
                </p>
              )}
              {saveError && (
                <p role="alert" className="flex items-center gap-3 text-red-400">
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
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section
            aria-label="Board columns"
            className="scrollbar-thin flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2"
          >
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
      </main>
      {authHeader && (
        <ChatSidebar authHeader={authHeader} onBoardUpdated={refreshBoard} />
      )}
    </div>
  );
};
