import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PlusIcon } from "@/components/icons";

const initialFormState = { title: "", details: "" };

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const close = () => {
    setFormState(initialFormState);
    setIsOpen(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = formState.title.trim();
    if (!title) {
      return;
    }
    onAdd(title, formState.details.trim());
    close();
  };

  return (
    <div>
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--text)] placeholder:text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="flex items-center gap-1.5 rounded-full border border-[var(--stroke-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--text)]"
            >
              <CloseIcon className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Add card
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--stroke-strong)] px-3 py-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] hover:bg-[var(--surface-strong)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add a card
        </button>
      )}
    </div>
  );
};
