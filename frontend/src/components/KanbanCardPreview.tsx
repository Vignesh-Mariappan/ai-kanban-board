import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rotate-2 cursor-grabbing rounded-2xl border border-[var(--primary-blue)] bg-[var(--surface-raised)] px-4 py-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)] [overflow-wrap:anywhere]">
    <h4 className="font-display text-[15px] font-semibold leading-snug text-[var(--text)]">
      {card.title}
    </h4>
    <p className="mt-1.5 text-sm leading-6 text-[var(--gray-text)]">
      {card.details}
    </p>
  </article>
);
