/**
 * An application's status as a small pill.
 *
 * THEME COLOURS ONLY. Accepted used to be raw green and rejected raw red —
 * the only green on the platform, and a red that the palette notes in
 * app/globals.css deliberately avoids. Accepted is now the orange accent,
 * because it is the one status that asks for a reply; pending is neutral;
 * rejected is quiet grey, since a decision already made needs no alarm.
 */
export function StatusBadge({ status }: { status: string }) {
  const key = status?.toLowerCase() || "pending";

  const styles: Record<string, string> = {
    pending: "border-zinc-700 bg-zinc-900 text-gray-300",
    accepted: "border-accent/60 bg-accent/10 text-accent",
    rejected: "border-zinc-800 bg-transparent text-gray-500",
  };

  const labels: Record<string, string> = {
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Declined",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        styles[key] ?? styles.pending
      }`}
    >
      {labels[key] ?? status}
    </span>
  );
}
