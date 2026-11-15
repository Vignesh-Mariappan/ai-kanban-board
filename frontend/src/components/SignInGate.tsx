"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { BoardApiError, createBasicAuthHeader, fetchBoard } from "@/lib/board-api";
import { CHAT_HISTORY_STORAGE_KEY } from "@/lib/chat-api";
import type { BoardData } from "@/lib/kanban";
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
  children: (board: BoardData, authHeader: string) => ReactNode;
};

export const SignInGate = ({ children }: SignInGateProps) => {
  const authHeader = useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSnapshot
  );
  const [loadedSession, setLoadedSession] = useState<{
    authHeader: string;
    board?: BoardData;
    error?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authHeader || loadedSession?.authHeader === authHeader) {
      return;
    }

    let active = true;
    fetchBoard(authHeader)
      .then((board) => {
        if (active) {
          setLoadedSession({ authHeader, board });
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setLoadedSession({
            authHeader,
            error:
              loadError instanceof Error
                ? loadError.message
                : "Unable to load your board.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [authHeader, loadedSession?.authHeader, retryCount]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const nextAuthHeader = createBasicAuthHeader(username, password);
      const board = await fetchBoard(nextAuthHeader);
      sessionStorage.setItem(sessionKey, nextAuthHeader);
      setLoadedSession({ authHeader: nextAuthHeader, board });
      notifySessionChanged();
    } catch (loginError) {
      setError(
        loginError instanceof BoardApiError && loginError.status === 401
          ? "Incorrect username or password."
          : loginError instanceof Error
            ? loginError.message
            : "Unable to sign in. Try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    setLoadedSession(null);
    notifySessionChanged();
    setUsername("");
    setPassword("");
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
            Single Board Kanban
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--text)]">
            Kanban Studio
          </h1>
          <h2 className="mt-8 text-base font-semibold text-[var(--text)]">
            Sign in
          </h2>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm font-medium text-[var(--text)]">
              Username
              <input
                autoComplete="username"
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--primary-blue)]"
                required
              />
            </label>
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
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (loadedSession?.authHeader !== authHeader) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p role="status" className="text-sm text-[var(--gray-text)]">
          Loading your board...
        </p>
      </main>
    );
  }

  if (loadedSession.error || !loadedSession.board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <section className="w-full max-w-md rounded-[28px] border border-[var(--stroke)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]">
          <h1 className="font-display text-2xl font-semibold text-[var(--text)]">
            Unable to load your board
          </h1>
          <p role="alert" className="mt-4 text-sm text-red-400">
            {loadedSession.error ?? "The board response was empty."}
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
        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-full border border-[var(--stroke-strong)] px-4 py-1.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--primary-blue)]"
        >
          <SignOutIcon />
          Sign out
        </button>
      </nav>
      {children(loadedSession.board, authHeader)}
    </div>
  );
};
