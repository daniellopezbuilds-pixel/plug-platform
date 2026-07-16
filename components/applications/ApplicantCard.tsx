"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { getResumeSignedUrl } from "@/lib/resume";
import type { ApplicantWithJob } from "@/hooks/useApplicants";

export function ApplicantCard({
  applicant,
  isUpdating,
  hasReviewed,
  onUpdateStatus,
  onReviewed,
}: {
  applicant: ApplicantWithJob;
  isUpdating: boolean;
  hasReviewed: boolean;
  onUpdateStatus: (id: string, status: "accepted" | "rejected" | "pending") => void;
  onReviewed: () => void;
}) {
  const [showReviewForm, setShowReviewForm] = useState(false);

  async function handleViewResume() {
    const path = applicant.profiles?.resume_path;
    if (!path) return;

    const { error, url } = await getResumeSignedUrl(path);

    if (error || !url) {
      alert(error || "Could not open resume.");
      return;
    }

    window.open(url, "_blank");
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-white">
            {applicant.profiles?.full_name || "Unknown Worker"}
          </h2>
          <p className="text-gray-400 text-sm">
            {applicant.profiles?.profile_number || "SP-000000"}
          </p>
        </div>
        <StatusBadge status={applicant.status} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {applicant.profiles?.years_experience !== null &&
          applicant.profiles?.years_experience !== undefined && (
            <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
              {applicant.profiles.years_experience}{" "}
              {applicant.profiles.years_experience === 1 ? "year" : "years"} experience
            </span>
          )}
        {applicant.profiles?.union_status && (
          <UnionBadge
            status={applicant.profiles.union_status}
            verified={applicant.profiles.union_verified || false}
          />
        )}
      </div>

      <p className="text-zinc-300 mb-4">
        Applied for <span className="font-semibold">{applicant.jobs?.title}</span>
      </p>

      <p className="text-gray-400 text-sm mb-4">
        Applied on {new Date(applicant.created_at).toLocaleDateString()}
      </p>

      {applicant.profiles?.resume_path && (
        <button
          onClick={handleViewResume}
          className="text-yellow-400 hover:text-yellow-300 text-sm font-semibold mb-4 block"
        >
          View Resume →
        </button>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onUpdateStatus(applicant.id, "accepted")}
          disabled={isUpdating || applicant.status === "accepted"}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          Accept
        </button>
        <button
          onClick={() => onUpdateStatus(applicant.id, "rejected")}
          disabled={isUpdating || applicant.status === "rejected"}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          Reject
        </button>
        {applicant.status !== "pending" && (
          <button
            onClick={() => onUpdateStatus(applicant.id, "pending")}
            disabled={isUpdating}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-gray-300 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            Reset
          </button>
        )}
      </div>

      {applicant.status === "accepted" && !hasReviewed && !showReviewForm && (
        <button
          onClick={() => setShowReviewForm(true)}
          className="text-yellow-400 hover:text-yellow-300 text-sm font-semibold mt-4 block"
        >
          Leave a review →
        </button>
      )}

      {applicant.status === "accepted" && hasReviewed && (
        <p className="text-green-400 text-sm mt-4">You reviewed this worker ✓</p>
      )}

      {showReviewForm && (
        <ReviewForm
          applicationId={applicant.id}
          revieweeId={applicant.worker_id}
          onSubmitted={() => {
            setShowReviewForm(false);
            onReviewed();
          }}
        />
      )}
    </Card>
  );
}