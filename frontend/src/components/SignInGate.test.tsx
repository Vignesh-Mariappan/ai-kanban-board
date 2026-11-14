import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { SignInGate } from "@/components/SignInGate";
import { CHAT_HISTORY_STORAGE_KEY } from "@/lib/chat-api";

const board = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: [] },
    { id: "col-discovery", title: "Discovery", cardIds: [] },
    { id: "col-progress", title: "In Progress", cardIds: [] },
    { id: "col-review", title: "Review", cardIds: [] },
    { id: "col-done", title: "Done", cardIds: [] },
  ],
  cards: {},
};

const renderGate = () =>
  render(
    <SignInGate>
      {() => <div>Private board</div>}
    </SignInGate>
  );

describe("SignInGate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => board })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("rejects invalid credentials without rendering the board", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid username or password" }),
    } as Response);
    renderGate();

    expect(screen.queryByText("Private board")).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Username"), "wrong");
    await userEvent.type(screen.getByLabelText("Password"), "credentials");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(screen.queryByText("Private board")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBeNull();
  });

  it("restores a signed-in session and clears it on sign-out", async () => {
    const user = userEvent.setup();
    const firstRender = renderGate();

    await user.type(await screen.findByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Private board")).toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBe(
      "Basic dXNlcjpwYXNzd29yZA=="
    );

    firstRender.unmount();
    sessionStorage.setItem(
      CHAT_HISTORY_STORAGE_KEY,
      JSON.stringify([{ role: "user", content: "Private chat" }])
    );
    renderGate();
    expect(await screen.findByText("Private board")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByText("Private board")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBeNull();
    expect(sessionStorage.getItem(CHAT_HISTORY_STORAGE_KEY)).toBeNull();
  });
});