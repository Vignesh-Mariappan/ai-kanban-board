import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { SignInGate } from "@/components/SignInGate";
import { chatHistoryKey } from "@/lib/chat-api";

const boards = [{ id: "board-1", name: "Project board" }];

const renderGate = () =>
  render(
    <SignInGate>
      {(loadedBoards) => <div>Private board: {loadedBoards[0].name}</div>}
    </SignInGate>
  );

describe("SignInGate", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => boards })
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

    expect(screen.queryByText(/Private board/)).not.toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Username"), "wrong");
    await userEvent.type(screen.getByLabelText("Password"), "credentials");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(screen.queryByText(/Private board/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBeNull();
  });

  it("rejects non-ASCII credentials without getting stuck", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid username or password" }),
    } as Response);
    renderGate();

    await userEvent.type(await screen.findByLabelText("Username"), "Łukasz");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect username or password."
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("restores a signed-in session and clears it on sign-out", async () => {
    const user = userEvent.setup();
    const firstRender = renderGate();

    await user.type(await screen.findByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Private board/)).toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBe(
      "Basic dXNlcjpwYXNzd29yZA=="
    );

    firstRender.unmount();
    sessionStorage.setItem(
      chatHistoryKey("board-1"),
      JSON.stringify([{ role: "user", content: "Private chat" }])
    );
    sessionStorage.setItem("kanban-mvp-board", "board-1");
    renderGate();
    expect(await screen.findByText(/Private board/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.queryByText(/Private board/)).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBeNull();
    expect(sessionStorage.getItem(chatHistoryKey("board-1"))).toBeNull();
    expect(sessionStorage.getItem("kanban-mvp-board")).toBeNull();
  });

  it("creates an account and signs in with the new credentials", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ username: "alice" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "board-a", name: "My first board" }],
      } as Response);
    renderGate();

    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeVisible();
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret-pass");
    await user.type(screen.getByLabelText("Confirm password"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Private board: My first board")).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toHaveTextContent("Signed in as alice");
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "alice", password: "secret-pass" }),
      })
    );
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBe(
      `Basic ${btoa("alice:secret-pass")}`
    );
  });

  it("reports mismatched passwords and taken usernames when creating an account", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "That username is already taken" }),
    } as Response);
    renderGate();

    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "secret-pass");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(fetch).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "secret-pass");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That username is already taken"
    );
    expect(screen.queryByText(/Private board/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem("kanban-mvp-auth")).toBeNull();
  });
});
