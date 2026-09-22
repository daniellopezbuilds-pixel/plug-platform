import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import type { Job } from "@/hooks/useJobs";
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
 * EVERYTHING THE CARD LEFT OUT, in a definition list rather than more prose:
 * these are short facts with names, and a reader comparing two jobs wants them
 * in the same place on both. The description stays prose because it is.
 *
 * ABSENT FIELDS ARE OMITTED, not rendered as "—". A dash tells a reader the
 * employer was asked and did not answer, which is true for a job posted today
 * and false for the seven that predate the fields existing. Either way it adds
 * a row that says nothing.
 */

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode | null;
}) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-gray-500 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-white mt-0.5">{value}</dd>
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
  const pay = formatPay(job);

  const requirements = [
    job.min_years_experience && `${job.min_years_experience} minimum`,
    job.certification_required,
    job.requires_own_tools && "Own tools",
    job.requires_own_transport && "Own transport",
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto scrollbar-dark">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-2xl font-bold text-white">{job.title}</h2>
          {job.required_union_status && (
            <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold whitespace-nowrap">
              {job.required_union_status === "union"
                ? "Union Required"
                : "Non-Union Required"}
            </span>
          )}
        </div>

        {job.company && <p className="text-gray-400 mt-1">{job.company}</p>}

        {job.classification && (
          <p className="text-sm font-semibold text-accent-2-soft mt-2">
            {job.classification}
          </p>
        )}

        {pay && (
          <p className="text-accent font-semibold text-xl mt-3">{pay}</p>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mt-5">
          <Detail label="Work type" value={jobOptionLabel(WORK_TYPES, job.work_type)} />
          <Detail label="Location" value={job.location} />
          <Detail label="Starts" value={formatStartDate(job.starts_on)} />
          <Detail
            label="Duration"
            value={jobOptionLabel(JOB_DURATIONS, job.duration)}
          />
          <Detail label="Shift" value={jobOptionLabel(JOB_SHIFTS, job.shift)} />
        </dl>

        {requirements.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">
              Requirements
            </h3>
            <ul className="flex flex-wrap gap-2">
              {requirements.map((requirement) => (
                <li
                  key={requirement}
                  className="text-sm text-gray-300 border border-zinc-700 rounded-full px-3 py-1"
                >
                  {requirement}
                </li>
              ))}
            </ul>
          </div>
        )}

        {job.description && (
          <div className="mt-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">
              Job description
            </h3>
            <p className="text-gray-300 whitespace-pre-line">
              {job.description}
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => onApply(job.id)}
            disabled={hasApplied || isApplying}
            className={`flex-1 px-5 py-3 rounded-lg font-semibold transition inline-flex items-center justify-center gap-2 min-h-11 ${
              hasApplied
                ? "bg-zinc-800 text-gray-400 cursor-not-allowed"
                : isApplying
                ? "bg-zinc-800 text-gray-300 cursor-wait"
                : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
          >
            {/* Tracks isApplying only. This button has three states, and the
                third — hasApplied — is a finished result, not work in
                progress; a spinner beside "Applied ✓" would say the opposite
                of what it means. */}
            <ButtonSpinner active={isApplying} />
            {hasApplied ? "Applied ✓" : isApplying ? "Applying..." : "Apply Now"}
          </button>
          <button
            onClick={onClose}
            className="bg-zinc-800 text-gray-300 px-5 py-3 rounded-lg font-semibold hover:bg-zinc-700 transition min-h-11"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
