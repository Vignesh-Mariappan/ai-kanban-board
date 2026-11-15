import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { PencilIcon } from "@/components/icons";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex h-full min-w-[260px] flex-1 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface)] transition",
        isOver && "border-[var(--accent-yellow)] bg-[var(--surface-strong)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="shrink-0 border-b border-[var(--stroke)] px-4 pb-3 pt-4">
        <div className="h-1 w-10 rounded-full bg-[var(--accent-yellow)]" />
        <div className="group mt-3 flex items-center gap-2">
          <input
            key={column.title}
            defaultValue={column.title}
            onBlur={(event) => {
              const title = event.currentTarget.value.trim();
              if (title && title !== column.title) {
                onRename(column.id, title);
              }
              // Show the saved title; a successful rename remounts the input via its key.
              event.currentTarget.value = column.title;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 -ml-1.5 font-display text-base font-semibold text-[var(--text)] outline-none transition hover:border-[var(--stroke-strong)] focus:border-[var(--primary-blue)]"
            aria-label="Column title"
          />
          <PencilIcon className="h-3.5 w-3.5 shrink-0 text-[var(--gray-text)] opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" />
          <span className="shrink-0 rounded-full bg-[var(--surface-raised)] px-2.5 py-0.5 text-xs font-semibold text-[var(--gray-text)]">
            {cards.length}
          </span>
        </div>
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke-strong)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <div className="shrink-0 px-3 pb-3">
        <NewCardForm
          onAdd={(title, details) => onAddCard(column.id, title, details)}
        />
      </div>
    </section>
  );
};
