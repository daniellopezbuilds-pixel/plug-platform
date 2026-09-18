"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Toasts, replacing window.alert().
 *
 * WHY ALERT HAD TO GO. It blocks the main thread until dismissed, so anything
 * still in flight behind it stalls; it is chrome, not the app, so it cannot be
 * styled and looks like the browser warning about something; and it stacks
 * badly — two alerts in a row is two modal interruptions. There were 54 of them.
 *
 * COLOURS. Success is `accent` (the orange) and errors are rose, not red. That
 * is not a deviation from the brief, it is the brief applied to this palette:
 * app/globals.css records that red-400 sits ΔE2000 10.6 from the orange and
 * red-500 only 9.2, so deepening the red makes it MORE confusable with the
 * primary accent, while rose-400 is 17.3 away and reads unmistakably as an
 * error. Every error surface in the app already uses rose; these match.
 */

type ToastVariant = "success" | "error";

type ToastRecord = {
  id: number;
  message: string;
  variant: ToastVariant;
};

/** Long enough to read a sentence, short enough not to linger. */
const DISMISS_AFTER_MS = 5000;

/**
 * Beyond this the stack becomes a wall that covers the thing it is reporting
 * on. Oldest goes first — the newest message is the one about what just
 * happened.
 */
const MAX_VISIBLE = 4;

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Call sites read `toast.success(...)` / `toast.error(...)`.
 *
 * Throws when used outside the provider rather than silently doing nothing: a
 * toast that never appears is a confirmation the user never gets, and the
 * failure should surface in development rather than in production as "the app
 * did not tell me it saved".
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }

  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  // Monotonic, in a ref rather than state: bumping it must not itself trigger a
  // render, and two toasts raised in the same tick must not collide on a key.
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    // An empty message would render an empty card. Callers pass error strings
    // straight through from Supabase, which can be undefined in edge cases.
    const text = (message ?? "").trim();
    if (!text) return;

    setToasts((current) => {
      const next = [...current, { id: nextId.current++, message: text, variant }];
      return next.slice(-MAX_VISIBLE);
    });
  }, []);

  // Memoised so the context value is stable and every consumer of useToast does
  // not re-render each time a toast appears or leaves.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
        Fixed, bottom-right on desktop and full-width along the bottom on a
        phone, where a corner card would either be too narrow to read or would
        sit under a thumb.

        pointer-events-none on the stack, restored on each card: the region is
        tall once several are showing, and it must not swallow clicks on the
        page behind the gaps between them.

        z-[70] clears the dashboard drawer (z-50) and the notification panel
        (z-[60]). A toast reports on what just happened and belongs above
        whatever raised it.
      */}
      <div
        className="pointer-events-none fixed z-[70] inset-x-0 bottom-0 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:w-96 sm:max-w-[calc(100vw-2rem)] flex flex-col gap-2"
        // Not aria-live: each card carries its own role, so the region would
        // announce twice.
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  const isError = toast.variant === "error";

  // Each card owns its own timer so the provider does not have to track a map
  // of them, and unmounting for any reason — dismissed by click, pushed out by
  // MAX_VISIBLE — clears it through the normal effect cleanup.
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      // Errors interrupt; confirmations wait their turn.
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`toast-enter pointer-events-auto w-full text-left rounded-xl border bg-zinc-900 shadow-xl px-4 py-3 flex items-start gap-3 transition hover:bg-zinc-800 ${
        isError ? "border-rose-900" : "border-zinc-800"
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${isError ? "text-rose-400" : "text-accent"}`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          {isError ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
      </span>

      {/* break-words: Supabase and Stripe error strings can be long and
          unbroken, and one would otherwise widen the card off-screen. */}
      <span className="min-w-0 flex-1 text-sm text-white break-words">
        {toast.message}
      </span>

      {/* Decorative: the whole card is the dismiss control and already
          announces itself, so this must not be a second tab stop. */}
      <span aria-hidden="true" className="shrink-0 text-gray-500 mt-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>
  );
}
