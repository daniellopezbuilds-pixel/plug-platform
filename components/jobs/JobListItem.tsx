import type { Job } from "@/hooks/useJobs";
import { Icon } from "@/components/ui/Icon";
import { timeAgo } from "@/lib/relativeTime";
import { WORK_TYPES, formatPay, jobOptionLabel } from "@/lib/jobs";

/**
 * One job in the split-view list — compact, for scanning twenty at a time.
 *
 * TITLE, COMPANY, LOCATION, PAY, POSTED, and at most three small tags. That
 * is what a job board list (JobStreet, Indeed) shows, and everything else is
 * one click away in the panel beside it. The old card carried the full fact
 * grid and a View details button, and four filled the screen.
 *
 * APPLIED IS VISIBLE HERE, so nobody opens a job they have already applied
 * to: a tick and "Applied" in the corner, and the row dimmed slightly.
 */
export function JobListItem({
  job,
  selected,
  hasApplied,
  onSelect,
}: {
  job: Job;
  selected: boolean;
  hasApplied: boolean;
  onSelect: (id: string) => void;
}) {
  const pay = formatPay(job);
  const meta = [job.company, job.location].filter(Boolean).join(" · ");

  const tags = [
    job.classification,
    jobOptionLabel(WORK_TYPES, job.work_type),
    job.required_union_status === "union"
      ? "Union"
      : job.required_union_status === "non_union"
      ? "Non-union"
      : null,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={() => onSelect(job.id)}
      aria-current={selected ? "true" : undefined}
      data-job-id={job.id}
      className={`relative block w-full rounded-xl border px-4 py-3 text-left transition ${
        selected
          ? "border-accent/70 bg-zinc-900"
          : "border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/60"
      }`}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent" />
      )}

      <span className="flex items-start justify-between gap-3">
        <span
          className={`line-clamp-2 min-w-0 font-semibold leading-snug ${
            hasApplied ? "text-gray-300" : "text-white"
          }`}
        >
          {job.title}
        </span>
        {hasApplied && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-semibold text-gray-300">
            <Icon name="check" className="h-3 w-3 text-accent" strokeWidth={3} />
            Applied
          </span>
        )}
      </span>

      {meta && <span className="mt-0.5 block truncate text-sm text-gray-400">{meta}</span>}

      <span className="mt-1.5 flex items-baseline justify-between gap-3">
        {pay ? (
          <span className="truncate text-sm font-semibold text-accent">{pay}</span>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-xs text-gray-500">{timeAgo(job.created_at)}</span>
      </span>

      {tags.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-gray-400"
            >
              {tag}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
