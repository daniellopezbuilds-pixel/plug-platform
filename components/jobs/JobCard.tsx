import type { Job } from "@/hooks/useJobs";
import { Icon, type IconName } from "@/components/ui/Icon";
import { timeAgo } from "@/lib/relativeTime";
import {
  JOB_DURATIONS,
  JOB_SHIFTS,
  WORK_TYPES,
  formatPay,
  formatStartDate,
  jobOptionLabel,
} from "@/lib/jobs";

/**
 * One job on the board.
 *
 * THE CARD IS FOR JUDGING, NOT FOR READING. An electrician scanning the board
 * is asking five questions: what classification, what kind of work, where,
 * what does it pay, when does it start. All five are here; everything else is
 * behind View details.
 *
 * READ TOP TO BOTTOM IN THE ORDER THOSE QUESTIONS GET ASKED. Classification is
 * an eyebrow above the title, because it decides whether the rest of the card
 * is worth reading. Pay is the loudest thing after the title, in accent,
 * because it is what people look at first and pretending otherwise just makes
 * them hunt.
 *
 * FACTS ARE A GRID OF ICON + VALUE, not one interpunct sentence. The sentence
 * wrapped unpredictably on a phone and put "Night" at the start of a line with
 * nothing to say it was a shift; each fact now has a fixed place and a glyph
 * that names it. Two columns from 400px, one below.
 *
 * EVERY FIELD DEGRADES ON ITS OWN. All of them are nullable — the seven jobs
 * posted before 20260922170000 have none — so each renders only when present
 * and the card simply gets shorter. A legacy job shows its title, location
 * and free-text pay, exactly as before.
 */
export function JobCard({
  job,
  hasApplied,
  onViewDetails,
}: {
  job: Job;
  hasApplied: boolean;
  onViewDetails: (job: Job) => void;
}) {
  const pay = formatPay(job);
  const posted = timeAgo(job.created_at);

  const facts: { icon: IconName; label: string; value: string | null }[] = [
    { icon: "mapPin", label: "Location", value: job.location },
    { icon: "briefcase", label: "Work type", value: jobOptionLabel(WORK_TYPES, job.work_type) },
    { icon: "calendar", label: "Start", value: formatStartDate(job.starts_on) },
    { icon: "clock", label: "Duration", value: jobOptionLabel(JOB_DURATIONS, job.duration) },
    { icon: "sun", label: "Shift", value: withSuffix(jobOptionLabel(JOB_SHIFTS, job.shift), "shift") },
  ];
  const shown = facts.filter((f) => f.value);

  const requirements = jobRequirementTags(job);

  return (
    <article className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        {job.classification ? (
          <p className="min-w-0 text-xs font-semibold uppercase tracking-wide text-accent-2-soft">
            {job.classification}
          </p>
        ) : (
          <span />
        )}
        {posted && (
          <p className="shrink-0 text-xs text-gray-500">
            <span className="sr-only">Posted </span>
            {posted}
          </p>
        )}
      </div>

      <h2 className="mt-1 break-words text-lg font-bold leading-snug text-white sm:text-xl">
        {job.title}
      </h2>
      {job.company && (
        <p className="mt-0.5 break-words text-sm text-gray-400">{job.company}</p>
      )}

      {pay && (
        <p className="mt-2 break-words text-lg font-semibold text-accent">
          {pay}
        </p>
      )}

      {shown.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm min-[400px]:grid-cols-2">
          {shown.map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-start gap-2">
              <dt className="mt-0.5 shrink-0 text-gray-500">
                <Icon name={fact.icon} />
                <span className="sr-only">{fact.label}</span>
              </dt>
              <dd className="min-w-0 break-words text-gray-300">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {requirements.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Requirements">
          {requirements.map((tag) => (
            <li
              key={tag.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                tag.strong
                  ? "border-accent-2/60 text-accent-2-soft"
                  : "border-zinc-700 text-gray-400"
              }`}
            >
              {tag.icon && <Icon name={tag.icon} className="h-3.5 w-3.5" />}
              {tag.label}
            </li>
          ))}
        </ul>
      )}

      {/* mt-auto pins the footer to the bottom, so where the board runs two
          columns the buttons of neighbouring cards line up whatever their
          height. */}
      <div className="mt-auto pt-4">
        <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          {hasApplied ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-300">
              <Icon name="checkCircle" className="h-5 w-5 text-accent" />
              You applied
            </p>
          ) : (
            <span className="hidden sm:block" />
          )}
          <button
            type="button"
            onClick={() => onViewDetails(job)}
            className={`min-h-11 w-full rounded-lg px-5 py-2.5 font-semibold transition sm:w-auto ${
              hasApplied
                ? "border border-zinc-700 text-white hover:border-zinc-500"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            View details
            <span className="sr-only">: {job.title}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function withSuffix(value: string | null, suffix: string): string | null {
  return value ? `${value} ${suffix}` : null;
}

/**
 * The short requirement tags, shared with the detail sheet.
 *
 * UNION STATUS IS A TAG HERE, and the strong one. It used to sit in the title
 * row in small caps, where it competed with the title for the one line that
 * wraps first on a phone; it is a requirement like the others, and it is the
 * one most likely to rule somebody out, so it leads and is drawn in magenta.
 */
export function jobRequirementTags(
  job: Job
): { label: string; icon?: IconName; strong?: boolean }[] {
  const tags: { label: string; icon?: IconName; strong?: boolean }[] = [];

  if (job.required_union_status) {
    tags.push({
      label: job.required_union_status === "union" ? "Union required" : "Non-union required",
      icon: "userGroup",
      strong: true,
    });
  }
  if (job.min_years_experience) {
    tags.push({ label: `${job.min_years_experience} min`, icon: "academic" });
  }
  if (job.requires_own_tools) tags.push({ label: "Own tools", icon: "wrench" });
  if (job.requires_own_transport) tags.push({ label: "Own transport", icon: "truck" });

  return tags;
}
