"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "./StatusBadge";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { MessageAboutJobButton } from "@/components/messaging/MessageAboutJobButton";
import { getResumeSignedUrl } from "@/lib/resume";
import type { ApplicantWithJob } from "@/hooks/useApplicants";
import { useToast } from "@/components/ui/Toast";

/**
 * One applicant, with enough on it to decide without leaving the page.
 *
 * WHAT IT USED TO SHOW: a name, a profile number, a years band, a union badge
 * and a resume link. An employer could not see who had applied — no photo, no
 * trade, no classification, no location, not a word of their bio — so judging
 * an applicant meant going to the directory and finding them by hand, which is
 * how applications end up sitting untouched.
 *
 * THE SAME HEADER THE PROFILE USES, not a bespoke arrangement of the same
 * fields. An employer who opens the full profile after reading this card
 * should recognise the same person presented the same way; two layouts for one
 * identity is how they stop matching.
 *
 * THE BIO IS CLAMPED BY LINES, NOT CHARACTERS. line-clamp cuts at the rendered
 * width, so it gives three real lines on a phone and three on a 1920 screen,
 * where a character count gives one line on one and half a paragraph on the
 * other. View profile is right there for the rest.
 */
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
  const toast = useToast();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [openingResume, setOpeningResume] = useState(false);

  const profile = applicant.profiles;

  async function handleViewResume() {
    const path = profile?.resume_path;
    if (!path) return;

    setOpeningResume(true);
    const { error, url } = await getResumeSignedUrl(path);
    setOpeningResume(false);

    if (error || !url) {
      // createSignedUrl runs as this employer, so a refusal here is the
      // storage policy doing its job — see can_view_resume() in
      // 20260922190000. Worth reporting plainly rather than as "something
      // went wrong".
      toast.error(error || "Could not open resume.");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <ProfileHeader
              size="compact"
              profileId={applicant.worker_id}
              fullName={profile?.full_name ?? null}
              signupType={profile?.signup_type}
              companyLogoPath={profile?.company_logo_path}
              trade={profile?.trade}
              classification={profile?.classification}
              location={profile?.location}
              yearsExperience={profile?.years_experience}
              unionStatus={profile?.union_status}
              unionVerified={profile?.union_verified ?? false}
            />
          </div>

          <StatusBadge status={applicant.status} />
        </div>

        {profile?.bio && (
          <p className="text-sm text-gray-300 whitespace-pre-wrap mb-4 line-clamp-3">
            {profile.bio}
          </p>
        )}

        <p className="text-gray-400 text-sm mb-4">
          Applied for{" "}
          <span className="font-semibold text-gray-300">
            {applicant.jobs?.title ?? "a job"}
          </span>{" "}
          on {new Date(applicant.created_at).toLocaleDateString()}
        </p>

        {/* LOOKING, then DECIDING, in two rows separated by a rule. Finding out
            more is one question — "do I know enough yet" — and accept/reject is
            a different one. A single row of five buttons put an irreversible
            action beside a harmless one at the same weight. */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            View profile
          </button>

          {/* Absent, not disabled, when there is no resume. A greyed-out button
              reads as "broken"; nothing reads as "they did not upload one",
              which the line below says outright. */}
          {profile?.resume_path && (
            <button
              type="button"
              onClick={handleViewResume}
              disabled={openingResume}
              className="bg-zinc-800 hover:bg-zinc-700 text-gray-200 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
            >
              {openingResume ? "Opening..." : "View resume"}
            </button>
          )}

          <MessageAboutJobButton
            otherUserId={applicant.worker_id}
            jobId={applicant.jobs?.id}
          />
        </div>

        {!profile?.resume_path && (
          <p className="text-xs text-gray-500 mb-3">No resume uploaded.</p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-zinc-800 pt-4">
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
            className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
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
            className="text-accent-2-soft hover:text-white text-sm font-semibold mt-4 block"
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

      {showProfile && (
        <ProfilePreviewModal
          userId={applicant.worker_id}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
