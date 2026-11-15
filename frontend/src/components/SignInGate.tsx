"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BoardApiError,
  SELECTED_BOARD_STORAGE_KEY,
  createBasicAuthHeader,
  fetchBoards,
  registerUser,
  usernameFromAuthHeader,
  type BoardSummary,
} from "@/lib/board-api";
import { clearChatHistories } from "@/lib/chat-api";
import { SignOutIcon } from "@/components/icons";

const sessionKey = "kanban-mvp-auth";
const sessionChangeEvent = "kanban-session-change";

const subscribeToSession = (callback: () => void) => {
  window.addEventListener(sessionChangeEvent, callback);
  return () => window.removeEventListener(sessionChangeEvent, callback);
};

const getSessionSnapshot = () => sessionStorage.getItem(sessionKey);

const getServerSnapshot = () => undefined;

const notifySessionChanged = () => {
  window.dispatchEvent(new Event(sessionChangeEvent));
};

type SignInGateProps = {
  children: (boards: BoardSummary[], authHeader: string) => ReactNode;
};

export const SignInGate = ({ children }: SignInGateProps) => {
  const authHeader = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSnapshot
  );
  const [loadedSession, setLoadedSession] = useState<{
    authHeader: string;
    boards?: BoardSummary[];
    error?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authHeader || loadedSession?.authHeader === authHeader) {
      return;
    }

    let active = true;
    fetchBoards(authHeader)
      .then((boards) => {
        if (active) {
          setLoadedSession({ authHeader, boards });
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setLoadedSession({
            authHeader,
            error:
              loadError instanceof Error
                ? loadError.message
                : "Unable to load your boards.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [authHeader, loadedSession?.authHeader, retryCount]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "sign-up" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      if (mode === "sign-up") {
        await registerUser(username, password);
      }
      const nextAuthHeader = createBasicAuthHeader(username, password);
      const boards = await fetchBoards(nextAuthHeader);
      sessionStorage.setItem(sessionKey, nextAuthHeader);
      setLoadedSession({ authHeader: nextAuthHeader, boards });
      notifySessionChanged();
    } catch (loginError) {
      setError(
        loginError instanceof BoardApiError && loginError.status === 401
          ? "Incorrect username or password."
          : loginError instanceof BoardApiError && loginError.status === 422
            ? "Usernames need 3-32 letters, numbers, dots, dashes, or underscores. Passwords need at least 8 characters."
            : loginError instanceof Error
              ? loginError.message
              : "Unable to sign in. Try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: typeof mode) => {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(SELECTED_BOARD_STORAGE_KEY);
    clearChatHistories();
    setLoadedSession(null);
    notifySessionChanged();
    setUsername("");
    switchMode("sign-in");
  };

  if (authHeader === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p role="status" className="text-sm text-[var(--gray-text)]">
          Restoring session...
        </p>
      </main>
    );
  }

  if (!authHeader) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <section className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-[var(--surface)] p-8 shadow-[var(--shadow)] sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
            Multi-board Kanban
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--text)]">
            Kanban Studio
          </h1>
          <h2 className="mt-8 text-base font-semibold text-[var(--text)]">
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm font-medium text-[var(--text)]">
              Username
              <input
                autoComplete="username"
                pattern={mode === "sign-up" ? "[A-Za-z0-9_.\\-]{3,32}" : undefined}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-[var(--text)]">
              Password
              <input
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                minLength={mode === "sign-up" ? 8 : undefined}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
            </label>
            {mode === "sign-up" && (
              <label className="block space-y-2 text-sm font-medium text-[var(--text)]">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setError("");
                  }}
                  className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary-blue)]"
                  required
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-red-400">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {mode === "sign-in"
                ? isSubmitting
                  ? "Signing in..."
                  : "Sign in"
                : isSubmitting
                  ? "Creating account..."
                  : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
            {mode === "sign-in" ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              className="font-semibold text-[var(--primary-blue)] hover:underline"
            >
              {mode === "sign-in" ? "Create an account" : "Sign in instead"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  if (loadedSession?.authHeader !== authHeader) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p role="status" className="text-sm text-[var(--gray-text)]">
          Loading your boards...
        </p>
      </main>
    );
  }

  if (loadedSession.error || !loadedSession.boards) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <section className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]">
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
            Unable to load your boards
          </h1>
          <p role="alert" className="mt-4 text-sm text-red-400">
            {loadedSession.error ?? "The boards response was empty."}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setLoadedSession(null);
                setRetryCount((count) => count + 1);
              }}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-[var(--stroke-strong)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <nav className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 grid-cols-3 gap-0.5 rounded-lg bg-[var(--surface-raised)] p-1.5" aria-hidden="true">
            <span className="rounded-sm bg-[var(--primary-blue)]" />
            <span className="rounded-sm bg-[var(--accent-yellow)]" />
            <span className="rounded-sm bg-[var(--secondary-purple)]" />
          </span>
          <span className="font-display text-lg font-semibold text-[var(--text)]">
            Kanban Studio
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-sm text-[var(--gray-text)]">
            Signed in as{" "}
            <span className="font-semibold text-[var(--text)]">
              {usernameFromAuthHeader(authHeader)}
            </span>
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--stroke-strong)] px-4 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--primary-blue)]"
          >
            <SignOutIcon />
            Sign out
          </button>
        </div>
      </nav>
      {children(loadedSession.boards, authHeader)}
    </div>
  );
};
