"use client";

import { useState } from "react";
import { formatPay } from "@/lib/jobs";
import { timeAgo } from "@/lib/relativeTime";
import { StatusBadge } from "./StatusBadge";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import { MessageAboutJobButton } from "@/components/messaging/MessageAboutJobButton";
import type { ApplicationWithJob } from "@/hooks/useApplications";

/**
 * One of your applications.
 *
 * A ROW, NOT A POSTER. It carried a 24px title, the full job description and
 * a date on its own line, so four applications filled a laptop screen and
 * the one thing that matters — which ones were accepted — was a small pill in
 * a corner. Now: employer photo, job, employer with their verified shield,
 * pay, when you applied, and the status; the description is on the board
 * where it belongs.
 *
 * ACCEPTED STANDS OUT, because it is the only status that asks you to do
 * something: an orange edge and a line saying what to do next.
 *
 * ONE MARKER BESIDE THE EMPLOYER'S NAME — the badge-system shield, via
 * VerifiedMark. The legacy employer_verified flag was folded into the
 * business_verified badge by 20260916130000, so there is one thing to render.
 */
export function ApplicationCard({
  application,
  hasReviewed,
  onReviewed,
}: {
  application: ApplicationWithJob;
  hasReviewed: boolean;
  onReviewed: () => void;
}) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const job = application.jobs;
  const employer = job?.profiles;
  const accepted = application.status === "accepted";
  // formatPay, not job.pay — otherwise a job posted with a structured rate
  // shows no pay here while showing it on the board.
  const pay = job ? formatPay(job) : null;

  return (
    <article
      className={`relative flex h-full flex-col rounded-xl border bg-zinc-950 p-4 ${
        accepted ? "border-accent/50" : "border-zinc-800"
      }`}
    >
      {accepted && (
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent" />
      )}

      <div className="flex items-start gap-3">
        <Avatar name={employer?.full_name} photoPath={employer?.company_logo_path} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words font-semibold leading-snug text-white">
              {job?.title || "Job no longer listed"}
            </h2>
            <StatusBadge status={application.status} />
          </div>
          {employer?.full_name && (
            <p className="flex items-center text-sm text-gray-400">
              <span className="truncate">{employer.full_name}</span>
              <VerifiedMark profileId={job?.user_id} />
            </p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {job?.location && (
              <span className="inline-flex items-center gap-1">
                <Icon name="mapPin" className="h-3.5 w-3.5" />
                {job.location}
              </span>
            )}
            {pay && <span className="font-semibold text-accent">{pay}</span>}
            <span>Applied {timeAgo(application.created_at)}</span>
          </p>
        </div>
      </div>

      {accepted && (
        <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-white">
          Accepted — message the employer to agree a start date.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        {/* Shown whatever the status: a question before a decision is as
            legitimate as one after it. */}
        <MessageAboutJobButton
          otherUserId={job?.user_id}
          jobId={job?.id}
          label="Message employer"
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 ${
            accepted
              ? "bg-accent text-on-accent hover:bg-accent-hover"
              : "border border-zinc-700 text-white hover:border-zinc-500"
          }`}
        />

        {accepted && job?.user_id && !hasReviewed && !showReviewForm && (
          <button
            type="button"
            onClick={() => setShowReviewForm(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:bg-zinc-900 hover:text-white"
          >
            <Icon name="star" />
            Review employer
          </button>
        )}

        {accepted && hasReviewed && (
          <span className="inline-flex items-center gap-1.5 px-1 text-sm text-gray-400">
            <Icon name="checkCircle" className="h-4 w-4 text-accent" />
            You reviewed this employer
          </span>
        )}
      </div>

      {showReviewForm && job?.user_id && (
        <ReviewForm
          applicationId={application.id}
          revieweeId={job.user_id}
          onSubmitted={() => {
            setShowReviewForm(false);
            onReviewed();
          }}
        />
      )}
    </article>
  );
}
