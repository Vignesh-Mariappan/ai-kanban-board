import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  onEdit: (cardId: string, title: string, details: string) => void;
  onDelete: (cardId: string) => void;
};

export const KanbanCard = ({ card, onEdit, onDelete }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    onEdit(card.id, nextTitle, details.trim());
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-2xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.25)]",
        "transition-all duration-150 hover:border-[var(--stroke-strong)]",
        !isEditing && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            aria-label="Edit card title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-[var(--stroke-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            aria-label="Edit card details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--gray-text)] outline-none focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-1.5 rounded-full border border-[var(--stroke-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--text)]"
              aria-label="Cancel editing"
            >
              <CloseIcon className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
              aria-label="Save changes"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2 [overflow-wrap:anywhere]">
          <div>
            <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--text)]">
              {card.title}
            </h4>
            <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
          </div>
          <div className="flex items-center justify-end gap-1 opacity-70 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => {
                setTitle(card.title);
                setDetails(card.details);
                setIsEditing(true);
              }}
              className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)] focus-visible:outline-2 focus-visible:outline-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit card"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-red-400 focus-visible:outline-2 focus-visible:outline-red-400"
              aria-label={`Delete ${card.title}`}
              title="Delete card"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
