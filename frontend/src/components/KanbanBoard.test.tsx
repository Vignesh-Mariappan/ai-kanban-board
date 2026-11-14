import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

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
    expect(input).toHaveValue("New Name");
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
    render(<KanbanBoard initialBoard={initialData} authHeader="Basic token" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));

    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-1")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board",
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
    render(<KanbanBoard initialBoard={initialData} authHeader="Basic token" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete Align roadmap themes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
  });
});
