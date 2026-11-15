import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { BoardWorkspace } from "@/components/BoardWorkspace";
import { initialData, type BoardData } from "@/lib/kanban";

const emptyBoard: BoardData = {
  columns: initialData.columns.map((column) => ({ ...column, cardIds: [] })),
  cards: {},
};

const boardWithCard = (title: string): BoardData => ({
  columns: initialData.columns.map((column, index) => ({
    ...column,
    cardIds: index === 0 ? ["card-1"] : [],
  })),
  cards: { "card-1": { id: "card-1", title, details: "" } },
});

let boardData: Record<string, BoardData>;

const respond = (body: unknown, status = 200) =>
  Promise.resolve({ ok: true, status, json: async () => body } as Response);

const fetchMock = vi.fn((url: string, init: RequestInit = {}) => {
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body as string) : undefined;
  if (url === "/api/boards" && method === "POST") {
    boardData["board-new"] = emptyBoard;
    return respond({ id: "board-new", name: body.name }, 201);
  }
  const boardId = url.split("/")[3];
  if (method === "PATCH") {
    return respond({ id: boardId, name: body.name });
  }
  if (method === "DELETE") {
    delete boardData[boardId];
    return respond(undefined, 204);
  }
  return respond(boardData[boardId]);
});

const boards = [
  { id: "board-a", name: "Alpha" },
  { id: "board-b", name: "Beta" },
];

const renderWorkspace = () =>
  render(<BoardWorkspace authHeader="Basic token" initialBoards={boards} />);

beforeEach(() => {
  sessionStorage.clear();
  boardData = { "board-a": boardWithCard("Alpha task"), "board-b": boardWithCard("Beta task") };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("BoardWorkspace", () => {
  it("shows the first board and switches to another board's cards", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(await screen.findByText("Alpha task")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Beta" }));

    expect(await screen.findByText("Beta task")).toBeInTheDocument();
    expect(screen.queryByText("Alpha task")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta" })).toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-board")).toBe("board-b");
  });

  it("restores the board selected earlier in the tab", async () => {
    sessionStorage.setItem("kanban-mvp-board", "board-b");
    renderWorkspace();

    expect(await screen.findByText("Beta task")).toBeInTheDocument();
  });

  it("creates a new empty board and selects it", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alpha task");

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("Board name"), "Launch");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("heading", { name: "Launch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Alpha task")).not.toBeInTheDocument();
    expect(screen.getAllByText("Drop a card here")).toHaveLength(5);
  });

  it("renames the selected board", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByText("Alpha task");

    await user.click(screen.getByRole("button", { name: "Rename board" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("Alpha");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("heading", { name: "Renamed" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Boards" })).getByText("Renamed"))
      .toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-a",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Renamed" }) })
    );
  });

  it("deletes the selected board only after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    renderWorkspace();
    await screen.findByText("Alpha task");

    await user.click(screen.getByRole("button", { name: "Delete board" }));
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete board" }));

    expect(await screen.findByText("Beta task")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    expect(confirm).toHaveBeenLastCalledWith('Delete "Alpha" and all of its cards?');
  });

  it("shows an empty state when there are no boards", () => {
    render(<BoardWorkspace authHeader="Basic token" initialBoards={[]} />);

    expect(screen.getByText(/You have no boards yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
  });

  it("creates a board from the empty state", async () => {
    const user = userEvent.setup();
    render(<BoardWorkspace authHeader="Basic token" initialBoards={[]} />);

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("Board name"), "Fresh start");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("heading", { name: "Fresh start" })).toBeInTheDocument();
    expect(screen.queryByText(/You have no boards yet/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-board")).toBe("board-new");
  });
});
