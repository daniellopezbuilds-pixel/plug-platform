"use client";

import Link from "next/link";
import type { Job } from "@/hooks/useJobs";
import { useProfileSummary } from "@/hooks/useProfileSummary";
import { jobRequirementTags } from "@/components/jobs/JobCard";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { EmployerVerifiedBadge } from "@/components/ui/EmployerVerifiedBadge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
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
 * Everything about one job, with Apply pinned to the bottom.
 *
 * The right-hand pane of the split view on a desktop, and a full-screen panel
 * with a back button on a phone — the same component, so the two can never
 * show different facts.
 *
 * THREE BANDS: a header (who is hiring, the title, the pay) that does not
 * scroll; the body (facts, requirements, the full description, the employer)
 * that does; and a footer holding Apply, which never scrolls away — the
 * button used to be at the end of the description.
 *
 * NOTHING WE DO NOT HOLD. No salary estimate, no company rating, no
 * "applicants so far" — the job board this is modelled on shows those, and we
 * have no data behind any of them.
 */
export function JobDetailPanel({
  job,
  hasApplied,
  isApplying,
  onApply,
  onBack,
}: {
  job: Job;
  hasApplied: boolean;
  isApplying: boolean;
  onApply: (jobId: string) => void;
  /** Phones only: back to the list. */
  onBack?: () => void;
}) {
  const employer = useProfileSummary(job.user_id);
  const pay = formatPay(job);
  const requirements = jobRequirementTags(job);
  const hiringName = job.company || employer?.full_name || "Employer";

  const facts: { icon: IconName; label: string; value: string | null }[] = [
    { icon: "academic", label: "Classification", value: job.classification },
    { icon: "briefcase", label: "Work type", value: jobOptionLabel(WORK_TYPES, job.work_type) },
    { icon: "sun", label: "Shift", value: jobOptionLabel(JOB_SHIFTS, job.shift) },
    { icon: "clock", label: "Duration", value: jobOptionLabel(JOB_DURATIONS, job.duration) },
    { icon: "calendar", label: "Start", value: formatStartDate(job.starts_on) },
    { icon: "mapPin", label: "Location", value: job.location },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* HEADER */}
      <div className="shrink-0 border-b border-zinc-800 px-4 pb-4 pt-3 sm:px-6 sm:pt-5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-gray-300 transition hover:text-white"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
            All jobs
          </button>
        )}

        <div className="flex items-center gap-3">
          <Avatar name={hiringName} photoPath={employer?.company_logo_path} />
          <div className="min-w-0">
            <p className="flex items-center truncate text-sm font-semibold text-gray-200">
              <span className="truncate">{hiringName}</span>
              <VerifiedMark profileId={job.user_id} />
            </p>
            <p className="truncate text-xs text-gray-500">
              {[job.location, `Posted ${timeAgo(job.created_at)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <h2 className="mt-3 break-words text-xl font-bold leading-snug text-white sm:text-2xl">
          {job.title}
        </h2>
        {pay && <p className="mt-1 text-lg font-semibold text-accent">{pay}</p>}
      </div>

      {/* BODY */}
      <div className="scrollbar-dark min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {facts
            .filter((f) => f.value)
            .map((f) => (
              <div key={f.label} className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-gray-400">
                  <Icon name={f.icon} />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs text-gray-500">{f.label}</dt>
                  <dd className="break-words text-sm text-white">{f.value}</dd>
                </div>
              </div>
            ))}
        </dl>

        {(requirements.length > 0 || job.certification_required) && (
          <section className="mt-6 border-t border-zinc-800 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-white">Requirements</h3>
            {requirements.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {requirements.map((tag) => (
                  <li
                    key={tag.label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                      tag.strong ? "border-accent-2/60 text-accent-2-soft" : "border-zinc-700 text-gray-300"
                    }`}
                  >
                    {tag.icon && <Icon name={tag.icon} className="h-4 w-4" />}
                    {tag.label}
                  </li>
                ))}
              </ul>
            )}
            {job.certification_required && (
              <p className="mt-3 flex items-start gap-2 text-sm text-gray-300">
                <Icon name="document" className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <span className="min-w-0 break-words">
                  <span className="text-gray-500">Certification: </span>
                  {job.certification_required}
                </span>
              </p>
            )}
          </section>
        )}

        {job.description && (
          <section className="mt-6 border-t border-zinc-800 pt-5">
            <h3 className="mb-2 text-sm font-semibold text-white">About the job</h3>
            <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-300">
              {job.description}
            </p>
          </section>
        )}

        <section className="mt-6 border-t border-zinc-800 pt-5">
          <h3 className="mb-3 text-sm font-semibold text-white">Posted by</h3>
          <Link
            href={`/dashboard/profile/${job.user_id}`}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-zinc-800 px-3 py-2.5 transition hover:border-zinc-700"
          >
            <Avatar name={employer?.full_name} photoPath={employer?.company_logo_path} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center truncate text-sm font-semibold text-white">
                <span className="truncate">{employer?.full_name || "Employer"}</span>
                <VerifiedMark profileId={job.user_id} />
              </span>
              {employer?.employer_verified && (
                <span className="mt-1 block">
                  <EmployerVerifiedBadge verified />
                </span>
              )}
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-600" />
          </Link>
        </section>
      </div>

      {/* APPLY — pinned; clears the iPhone home indicator on a phone. */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
        <button
          type="button"
          onClick={() => onApply(job.id)}
          disabled={hasApplied || isApplying}
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-5 font-semibold transition ${
            hasApplied
              ? "cursor-not-allowed border border-zinc-700 text-gray-300"
              : isApplying
              ? "cursor-wait bg-zinc-800 text-gray-300"
              : "bg-accent text-on-accent hover:bg-accent-hover"
          }`}
        >
          {/* Spinner tracks isApplying only — hasApplied is a finished
              result, and a spinner beside it would say the opposite. */}
          <ButtonSpinner active={isApplying} />
          {hasApplied && <Icon name="checkCircle" className="h-5 w-5 text-accent" />}
          {hasApplied ? "You applied to this job" : isApplying ? "Applying..." : "Apply now"}
        </button>
      </div>
    </div>
  );
}
