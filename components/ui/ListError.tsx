import { Icon } from "./Icon";

/**
 * A list that failed to load — shown INSTEAD OF its empty state.
 *
 * WHY THIS EXISTS. usePagedList turns a failed query into an empty list, and
 * the pages used to check only for emptiness, so a query error rendered as
 * "No applications yet". That is exactly how My Applications showed nothing
 * for weeks to people with seven applications: its select embedded a
 * relationship that does not exist, every load failed, and the page said
 * there was nothing to show. An error must look like an error, with a way to
 * try again, or it is indistinguishable from an empty account.
 */
export function ListError({
  what,
  message,
  onRetry,
}: {
  /** What failed to load, as the reader would say it: "your applications". */
  what: string;
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-rose-900/70 px-6 py-10 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-rose-900 text-rose-400">
        <Icon name="exclamation" className="h-5 w-5" />
      </span>
      <p className="font-semibold text-white">Could not load {what}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
        Your data is safe — this is a problem showing it. Try again, and if it
        keeps happening let us know from the Requests page.
      </p>
      {message && <p className="mx-auto mt-2 max-w-sm break-words font-mono text-xs text-gray-500">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 rounded-lg border border-zinc-700 px-5 text-sm font-semibold text-white transition hover:border-zinc-500"
        >
          Try again
        </button>
      )}
    </div>
  );
}
