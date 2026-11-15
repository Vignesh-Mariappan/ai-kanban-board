import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { KanbanColumn } from "@/components/KanbanColumn";
import { initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const noop = () => {};

const TestDndContext = ({ children }: { children: ReactNode }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
};

const renderColumn = (column = initialData.columns[0], cards = initialData.cards) => {
  const element = (nextColumn: typeof column, nextCards: typeof cards): ReactNode => (
    <TestDndContext>
      <KanbanColumn
        column={nextColumn}
        cards={nextColumn.cardIds.map((cardId) => nextCards[cardId])}
        onRename={noop}
        onAddCard={noop}
        onEditCard={noop}
        onDeleteCard={noop}
      />
    </TestDndContext>
  );
  const result = render(element(column, cards));
  return {
    rerender: (nextColumn: typeof column, nextCards: typeof cards) =>
      result.rerender(element(nextColumn, nextCards)),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("KanbanBoard", () => {
  it("renders a card drag preview", () => {
    render(
      <KanbanCardPreview
        card={{ id: "preview", title: "Preview card", details: "Preview details" }}
      />
    );

    expect(screen.getByText("Preview card")).toBeInTheDocument();
    expect(screen.getByText("Preview details")).toBeInTheDocument();
  });

  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();
    expect(within(column).getByLabelText("Column title")).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card title and details", async () => {
    render(<KanbanBoard />);
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: "Edit Align roadmap themes" }));
    await userEvent.clear(within(card).getByLabelText("Edit card title"));
    await userEvent.type(within(card).getByLabelText("Edit card title"), "Updated roadmap");
    await userEvent.clear(within(card).getByLabelText("Edit card details"));
    await userEvent.type(within(card).getByLabelText("Edit card details"), "Updated notes");
    await userEvent.click(within(card).getByRole("button", { name: "Save changes" }));

    expect(within(card).getByText("Updated roadmap")).toBeInTheDocument();
    expect(within(card).getByText("Updated notes")).toBeInTheDocument();
  });

  it("cancels card editing without changing the card", async () => {
    render(<KanbanBoard />);
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: "Edit Align roadmap themes" }));
    await userEvent.clear(within(card).getByLabelText("Edit card title"));
    await userEvent.type(within(card).getByLabelText("Edit card title"), "Discard this edit");
    await userEvent.click(within(card).getByRole("button", { name: "Cancel editing" }));

    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(card).queryByText("Discard this edit")).not.toBeInTheDocument();
  });

  it("saves a board change through the API", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: async () => JSON.parse(init.body as string),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<KanbanBoard initialBoard={initialData} api={{ authHeader: "Basic token", boardId: "board-1" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-1")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("keeps the existing board visible and reports a failed save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Database unavailable" }),
      })
    );
    render(<KanbanBoard initialBoard={initialData} api={{ authHeader: "Basic token", boardId: "board-1" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
  });

  it("shows a column title changed outside the input, such as by the AI", () => {
    const { rerender } = renderColumn();
    rerender({ ...initialData.columns[0], title: "Renamed by AI" }, initialData.cards);

    expect(screen.getByLabelText("Column title")).toHaveValue("Renamed by AI");
  });

  it("restores the saved column title when a rename fails to save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Database unavailable" }),
      })
    );
    render(<KanbanBoard initialBoard={initialData} api={{ authHeader: "Basic token", boardId: "board-1" }} />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Rejected name");
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(input).toHaveValue("Backlog");
  });

  it("opens the card editor with the latest card text", async () => {
    const { rerender } = renderColumn();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: "Edit Align roadmap themes" }));
    await userEvent.type(within(card).getByLabelText("Edit card title"), " draft");
    await userEvent.click(within(card).getByRole("button", { name: "Cancel editing" }));

    rerender(initialData.columns[0], {
      ...initialData.cards,
      "card-1": { id: "card-1", title: "Edited by AI", details: "New details" },
    });
    await userEvent.click(within(card).getByRole("button", { name: "Edit Edited by AI" }));

    expect(within(card).getByLabelText("Edit card title")).toHaveValue("Edited by AI");
    expect(within(card).getByLabelText("Edit card details")).toHaveValue("New details");
  });

  it("disables dragging a card while it is being edited", async () => {
    renderColumn();
    const card = screen.getByTestId("card-card-1");
    expect(card).toHaveAttribute("aria-roledescription", "sortable");

    await userEvent.click(within(card).getByRole("button", { name: "Edit Align roadmap themes" }));

    expect(card).not.toHaveAttribute("aria-roledescription");
    expect(within(card).getByLabelText("Edit card title")).toBeEnabled();
  });
});
