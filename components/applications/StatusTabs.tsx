"use client";

/**
 * All / Waiting / Accepted / Declined, with a count on each.
 *
 * Borrowed from Indeed's "My jobs" and the pipeline tabs in applicant
 * trackers: status is the only way anybody sorts applications, from either
 * side of a hire. Pills rather than underlined tabs so four of them fit on a
 * 375px screen without scrolling.
 *
 * The value "" is All. Counts are optional; a missing one is simply not shown
 * rather than shown as a guess.
 */
export type StatusTabValue = "" | "pending" | "accepted" | "rejected";

export function StatusTabs({
  value,
  onChange,
  counts,
  labels = { pending: "Waiting", accepted: "Accepted", rejected: "Declined" },
}: {
  value: StatusTabValue;
  onChange: (next: StatusTabValue) => void;
  counts?: Partial<Record<StatusTabValue, number>>;
  labels?: { pending: string; accepted: string; rejected: string };
}) {
  const tabs: { value: StatusTabValue; label: string }[] = [
    { value: "", label: "All" },
    { value: "pending", label: labels.pending },
    { value: "accepted", label: labels.accepted },
    { value: "rejected", label: labels.rejected },
  ];

  return (
    <div role="radiogroup" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const count = counts?.[tab.value];
        return (
          <button
            key={tab.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tab.value)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
              selected
                ? "border-accent bg-accent/10 text-white"
                : "border-zinc-800 text-gray-400 hover:border-zinc-600 hover:text-white"
            }`}
          >
            {tab.label}
            {count !== undefined && (
              <span className={selected ? "text-accent" : "text-gray-500"}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
