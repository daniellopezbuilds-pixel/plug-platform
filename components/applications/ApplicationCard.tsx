"use client";

import { useState } from "react";
import { formatPay } from "@/lib/jobs";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { getBrandingPublicUrl } from "@/lib/branding";
import { NameMeta } from "@/components/ui/NameMeta";
import type { ApplicationWithJob } from "@/hooks/useApplications";

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

  return (
    <Card>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          {employer?.company_logo_path && (
            <img
              src={getBrandingPublicUrl(employer.company_logo_path)}
              alt={employer.full_name || "Company logo"}
              className="w-12 h-12 rounded-full object-cover border border-zinc-700 shrink-0"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold text-white">{job?.title || "Job unavailable"}</h2>
            {/* ONE MARKER BESIDE A NAME. A green "✓ Verified" from the legacy
                profiles.employer_verified flag used to sit here, an inch from
                the marker NameMeta draws — two ticks against one name, each
                meaning something different and neither saying which. That flag
                was folded into the business_verified badge by 20260916130000,
                so the badge system is where it belongs and NameMeta is the one
                thing that renders it. */}
            {employer?.full_name && (
              <p className="text-gray-400 text-sm flex items-center gap-1.5">
                {employer.full_name}
                <NameMeta
                  profileId={job?.user_id}
                  signupType={employer.signup_type}
                  inline
                />
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={application.status} />
      </div>

      {job?.location && <p className="text-gray-400 mb-1">{job.location}</p>}
      {/* formatPay, not job.pay — otherwise a job posted with a structured
          rate shows no pay at all here while showing it on the board. */}
      {job && formatPay(job) && (
        <p className="text-accent font-semibold mb-4">{formatPay(job)}</p>
      )}
      {job?.description && <p className="text-gray-300 mb-4">{job.description}</p>}

      <p className="text-gray-400 text-sm">
        Applied on {new Date(application.created_at).toLocaleDateString()}
      </p>

      {application.status === "accepted" && job?.user_id && !hasReviewed && !showReviewForm && (
        <button
          onClick={() => setShowReviewForm(true)}
          className="text-accent-2-soft hover:text-white text-sm font-semibold mt-4 block"
        >
          Leave a review →
        </button>
      )}

      {application.status === "accepted" && hasReviewed && (
        <p className="text-green-400 text-sm mt-4">You reviewed this employer ✓</p>
      )}

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
    </Card>
  );
}