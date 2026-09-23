"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "./Icon";

/**
 * Confirmation before anything that destroys or cannot be undone.
 *
 * REPLACES window.confirm(), which the app used in two places and skipped
 * everywhere else: deleting a post or a comment, declining an applicant or a
 * connection request, and every admin decision happened on the first click
 * with no chance to back out. A native confirm is also chrome, not the app —
 * unstyled, blocking, and worded by the browser.
 *
 * USAGE:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, body, confirmLabel, tone: "danger" }))) return;
 *   // ...do it, then toast.success(...)
 *
 * WHAT THE DIALOG SAYS: what is about to happen in plain words (title), what
 * it affects (body), and a confirm button named for the action — "Delete
 * post", not "OK". Cancel is always there and always the easy way out:
 * it has focus when the dialog opens, and Escape or a click on the backdrop
 * both cancel.
 *
 * DANGER IS ROSE, the palette's one error colour, as an outline-weight fill —
 * clearly the destructive choice without being a raw browser-red button. A
 * non-destructive but irreversible action (approving, which notifies someone)
 * uses the orange primary.
 *
 * NOT FOR SAVES. A profile save is reversible and gets a toast, not a modal.
 */

export type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  return confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  function close(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmModal {...pending} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onClose,
}: ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Where focus was, so it can go back there when the dialog closes.
  const returnTo = useRef<Element | null>(null);
  // Latest onClose without re-running the mount effect: that effect records
  // where focus came from and moves it to Cancel, and must do both once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    returnTo.current = document.activeElement;
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Captured and stopped here, so an Escape meant for this dialog does
        // not also close whatever it was opened over (a job sheet, the
        // details panel).
        e.preventDefault();
        e.stopImmediatePropagation();
        onCloseRef.current(false);
        return;
      }
      // Keep Tab inside the dialog: two buttons, so cycle between them.
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>("button");
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const danger = tone === "danger";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        className="w-full rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-5"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
              danger ? "border-rose-900 text-rose-400" : "border-accent/50 text-accent"
            }`}
          >
            <Icon name={danger ? "exclamation" : "info"} className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-1.5">
            <h2 id={titleId} className="font-semibold text-white">
              {title}
            </h2>
            {body && (
              <div id={bodyId} className="mt-1.5 text-sm leading-relaxed text-gray-400">
                {body}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onClose(false)}
            className="min-h-11 rounded-lg border border-zinc-700 px-5 text-sm font-semibold text-white transition hover:border-zinc-500"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`min-h-11 rounded-lg px-5 text-sm font-semibold transition ${
              danger
                ? "border border-rose-800 bg-rose-950 text-rose-200 hover:border-rose-600 hover:bg-rose-900"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
