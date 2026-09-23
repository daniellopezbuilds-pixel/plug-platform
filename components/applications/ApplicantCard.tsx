"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { timeAgo } from "@/lib/relativeTime";
import { StatusBadge } from "./StatusBadge";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { MessageAboutJobButton } from "@/components/messaging/MessageAboutJobButton";
import { getResumeSignedUrl } from "@/lib/resume";
import type { ApplicantWithJob } from "@/hooks/useApplicants";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

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
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-white transition hover:border-zinc-500 disabled:opacity-50";

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
  const confirm = useConfirm();

  async function handleDecline() {
    const ok = await confirm({
      title: `Decline ${profile?.full_name || "this applicant"}?`,
      body: `They are told their application for ${applicant.jobs?.title ?? "this job"} was not successful. You can undo the decision, but not the notification.`,
      confirmLabel: "Decline applicant",
    });
    if (ok) onUpdateStatus(applicant.id, "rejected");
  }
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

  const decided = applicant.status === "accepted" || applicant.status === "rejected";

  return (
    <>
      <article
        className={`flex h-full flex-col rounded-xl border bg-zinc-950 p-4 ${
          applicant.status === "accepted" ? "border-accent/50" : "border-zinc-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
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
          <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-gray-300">
            {profile.bio}
          </p>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <Icon name="briefcase" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            Applied for{" "}
            <span className="font-semibold text-gray-300">{applicant.jobs?.title ?? "a job"}</span>{" "}
            {timeAgo(applicant.created_at)}
          </span>
        </p>

        {/* LOOKING, then DECIDING, in two rows separated by a rule. Finding
            out more is one question and accept/decline is a different one; a
            single row put an irreversible action beside a harmless one at the
            same weight. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowProfile(true)} className={SECONDARY}>
            <Icon name="user" />
            Profile
          </button>

          {/* Absent, not disabled, when there is no resume — a greyed-out
              button reads as broken. The line below says it outright. */}
          {profile?.resume_path && (
            <button type="button" onClick={handleViewResume} disabled={openingResume} className={SECONDARY}>
              <Icon name="document" />
              {openingResume ? "Opening..." : "Résumé"}
            </button>
          )}

          <MessageAboutJobButton
            otherUserId={applicant.worker_id}
            jobId={applicant.jobs?.id}
            className={SECONDARY}
          />
        </div>

        {!profile?.resume_path && <p className="mt-2 text-xs text-gray-500">No résumé uploaded.</p>}

        {/* THEME COLOURS. Accept and Reject were solid green and solid red.
            Accept is the orange primary; Decline is an outline, because
            turning someone down should not be the loudest thing on the card;
            Undo puts a decision back to pending. */}
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
            {!decided ? (
              <>
                <button
                  type="button"
                  onClick={() => onUpdateStatus(applicant.id, "accepted")}
                  disabled={isUpdating}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
                >
                  <Icon name="check" />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isUpdating}
                  className="inline-flex min-h-11 items-center rounded-lg border border-zinc-700 px-4 text-sm font-semibold text-gray-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
                >
                  Decline
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-gray-400">
                  {applicant.status === "accepted" ? "You accepted this applicant." : "You declined this applicant."}
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateStatus(applicant.id, "pending")}
                  disabled={isUpdating}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:bg-zinc-900 hover:text-white disabled:opacity-40"
                >
                  Undo
                </button>
              </>
            )}
  
            {applicant.status === "accepted" && !hasReviewed && !showReviewForm && (
              <button
                type="button"
                onClick={() => setShowReviewForm(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:bg-zinc-900 hover:text-white"
              >
                <Icon name="star" />
                Review worker
              </button>
            )}
  
            {applicant.status === "accepted" && hasReviewed && (
              <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
                <Icon name="checkCircle" className="h-4 w-4 text-accent" />
                Reviewed
              </span>
            )}
          </div>
        </div>

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
      </article>

      {showProfile && (
        <ProfilePreviewModal
          userId={applicant.worker_id}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
