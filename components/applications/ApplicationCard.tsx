"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { ReviewForm } from "@/components/reviews/ReviewForm";
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

  return (
    <Card>
      <div className="flex items-start justify-between mb-2">
        <h2 className="text-2xl font-bold text-white">{job?.title || "Job unavailable"}</h2>
        <StatusBadge status={application.status} />
      </div>

      {job?.location && <p className="text-zinc-400 mb-1">{job.location}</p>}
      {job?.pay && <p className="text-green-400 font-semibold mb-4">{job.pay}</p>}
      {job?.description && <p className="text-gray-300 mb-4">{job.description}</p>}

      <p className="text-gray-400 text-sm">
        Applied on {new Date(application.created_at).toLocaleDateString()}
      </p>

      {application.status === "accepted" && job?.user_id && !hasReviewed && !showReviewForm && (
        <button
          onClick={() => setShowReviewForm(true)}
          className="text-yellow-400 hover:text-yellow-300 text-sm font-semibold mt-4 block"
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