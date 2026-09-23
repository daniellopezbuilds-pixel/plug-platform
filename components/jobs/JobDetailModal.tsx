"use client";

import { useEffect, useId } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Job } from "@/hooks/useJobs";
import { jobRequirementTags } from "@/components/jobs/JobCard";
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
 * The full job, and the Apply button.
 *
 * A BOTTOM SHEET ON A PHONE, A DIALOG FROM `sm`. Centred in a 375px viewport
 * the old dialog was a box with 16px of black round it and Apply at the
 * bottom of a scroll — on a long description you had to find the end of the
 * text to find the button. Now the header and the action bar are fixed and
 * only the middle scrolls, so Apply is on screen from the moment it opens.
 *
 * EVERYTHING THE CARD LEFT OUT, in a definition list rather than prose: short
 * facts with names, which a reader comparing two jobs wants in the same place
 * on both. The description stays prose because it is.
 *
 * ABSENT FIELDS ARE OMITTED, not rendered as "—". A dash tells a reader the
 * employer was asked and did not answer, which is false for the seven jobs
 * that predate the fields existing.
 */

function Detail({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-gray-400">
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="break-words text-sm text-white">{value}</dd>
      </div>
    </div>
  );
}

export function JobDetailModal({
  job,
  hasApplied,
  isApplying,
  onApply,
  onClose,
}: {
  job: Job;
  hasApplied: boolean;
  isApplying: boolean;
  onApply: (jobId: string) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const pay = formatPay(job);
  const posted = timeAgo(job.created_at);
  const requirements = jobRequirementTags(job);

  // Escape closes, as every other overlay in the app does.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center sm:p-4"
      // A tap on the dimmed area closes; a tap inside the sheet must not, so
      // only a click whose target IS the backdrop counts.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-zinc-800 bg-zinc-900 sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl"
      >
        {/* HEADER — does not scroll */}
        <div className="flex shrink-0 items-start gap-3 border-b border-zinc-800 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            {job.classification && (
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-2-soft">
                {job.classification}
              </p>
            )}
            <h2
              id={titleId}
              className="mt-1 break-words text-xl font-bold leading-snug text-white sm:text-2xl"
            >
              {job.title}
            </h2>
            {(job.company || posted) && (
              <p className="mt-0.5 break-words text-sm text-gray-400">
                {[job.company, posted && `Posted ${posted}`].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {/* BODY — the only part that scrolls */}
        <div className="scrollbar-dark min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {pay && (
            <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="text-xs text-gray-500">Pay</p>
              <p className="break-words text-xl font-semibold text-accent">{pay}</p>
            </div>
          )}

          <dl className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
            <Detail icon="mapPin" label="Location" value={job.location} />
            <Detail
              icon="briefcase"
              label="Work type"
              value={jobOptionLabel(WORK_TYPES, job.work_type)}
            />
            <Detail icon="calendar" label="Start" value={formatStartDate(job.starts_on)} />
            <Detail
              icon="clock"
              label="Duration"
              value={jobOptionLabel(JOB_DURATIONS, job.duration)}
            />
            <Detail icon="sun" label="Shift" value={jobOptionLabel(JOB_SHIFTS, job.shift)} />
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
                        tag.strong
                          ? "border-accent-2/60 text-accent-2-soft"
                          : "border-zinc-700 text-gray-300"
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
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-300">
                {job.description}
              </p>
            </section>
          )}
        </div>

        {/* ACTIONS — pinned. The bottom padding clears the iPhone home
            indicator when the sheet sits on the bottom edge. */}
        <div className="flex shrink-0 gap-3 border-t border-zinc-800 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
          <button
            type="button"
            onClick={() => onApply(job.id)}
            disabled={hasApplied || isApplying}
            className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 font-semibold transition ${
              hasApplied
                ? "cursor-not-allowed bg-zinc-800 text-gray-300"
                : isApplying
                ? "cursor-wait bg-zinc-800 text-gray-300"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {/* Tracks isApplying only. hasApplied is a finished result, not
                work in progress; a spinner beside it would say the opposite. */}
            <ButtonSpinner active={isApplying} />
            {hasApplied && <Icon name="checkCircle" className="h-5 w-5 text-accent" />}
            {hasApplied ? "Applied" : isApplying ? "Applying..." : "Apply now"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-gray-300 transition hover:border-zinc-500 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
