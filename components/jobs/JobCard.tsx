import { Card } from "@/components/ui/Card";
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
 * One job on the board.
 *
 * THE CARD IS FOR JUDGING, NOT FOR READING. It carried a title, a company, a
 * location and a pay string — enough to know a job exists and not enough to
 * know whether it is yours. An electrician scanning the board is asking five
 * questions: what classification, what kind of work, where, what does it pay,
 * when does it start. All five are here; everything else is behind View
 * Details.
 *
 * PAY IS THE LOUDEST THING ON THE CARD, in accent rather than body grey,
 * because it is what people look at first and pretending otherwise just makes
 * them hunt.
 *
 * THE FACT ROW DEGRADES FIELD BY FIELD. Every one of these is nullable — the
 * seven jobs posted before 20260922170000 have none of them — so each renders
 * only when present and the row simply gets shorter. A legacy job shows its
 * title, its location and its free-text pay, exactly as it did before.
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
  const startsOn = formatStartDate(job.starts_on);

  const facts = [
    jobOptionLabel(WORK_TYPES, job.work_type),
    job.location,
    jobOptionLabel(JOB_DURATIONS, job.duration),
    jobOptionLabel(JOB_SHIFTS, job.shift),
    startsOn,
  ].filter(Boolean);

  return (
    <Card>
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

      {/* The classification sits directly under the title rather than in the
          fact row: it is the single field that decides whether the rest of the
          card is worth reading. */}
      {job.classification && (
        <p className="text-sm font-semibold text-accent-2-soft mt-2">
          {job.classification}
        </p>
      )}

      {facts.length > 0 && (
        <p className="text-gray-400 text-sm mt-2">
          {/* Interpuncts rather than one chip per fact. Five chips on a card
              this size wrap into a block that competes with the title for
              attention; a single line reads as one sentence of context. */}
          {facts.join(" · ")}
        </p>
      )}

      {pay && (
        <p className="text-accent font-semibold text-lg mt-3">{pay}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {job.requires_own_tools && (
          <span className="text-xs text-gray-400 border border-zinc-700 rounded-full px-2.5 py-1">
            Own tools
          </span>
        )}
        {job.requires_own_transport && (
          <span className="text-xs text-gray-400 border border-zinc-700 rounded-full px-2.5 py-1">
            Own transport
          </span>
        )}
        {job.min_years_experience && (
          <span className="text-xs text-gray-400 border border-zinc-700 rounded-full px-2.5 py-1">
            {job.min_years_experience} min
          </span>
        )}
      </div>

      <button
        onClick={() => onViewDetails(job)}
        className="mt-4 px-5 py-3 rounded-lg font-semibold bg-accent text-on-accent hover:bg-accent-hover transition min-h-11"
      >
        {hasApplied ? "View Details (Applied ✓)" : "View Details"}
      </button>
    </Card>
  );
}
