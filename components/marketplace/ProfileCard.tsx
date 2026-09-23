"use client";

import Link from "next/link";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { EmployerVerifiedBadge } from "@/components/ui/EmployerVerifiedBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { MessagePersonButton } from "@/components/messaging/MessagePersonButton";
import { getResumeSignedUrl } from "@/lib/resume";
import { signupTypeLabel } from "@/lib/signupRoles";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";
import type { DirectoryProfile } from "@/hooks/useDirectory";
import type { ConnectionInfo } from "@/hooks/useConnections";
import { useToast } from "@/components/ui/Toast";

/**
 * One person in My Local Network.
 *
 * WHAT WAS WRONG. No photo, so every card was a wall of text. "No reviews
 * yet" sat top-right — the most prominent spot on the card given to the least
 * useful fact. The verified shield was missing, so a verified C-10 looked
 * identical to an unverified one. Connected was raw green. And 24px of
 * padding round a card that half-filled it.
 *
 * NOW, TOP TO BOTTOM, IN THE ORDER A PERSON IS JUDGED: who (photo, name,
 * shield, account type), what (trade and classification), where and how long
 * (city, experience), trust (verified employer, union, reviews — only when
 * there are some), then one sentence of bio, then one action. The layout is
 * borrowed from pro cards on Thumbtack and Angi, where trust signals sit
 * directly under the name because that is what the reader is deciding on.
 *
 * ONE ACTION, IN THE HEADER ROW, depending on where you stand with them:
 * Connect, Accept (they asked you), Message (you are connected), or a quiet
 * "Sent". It used to own a row at the bottom of the card, which made every
 * card taller than its content and left the button stranded. Résumé is a
 * small link at the end of the badge row.
 */
export function ProfileCard({
  profile,
  connection,
  isActing,
  onConnect,
  onAccept,
}: {
  profile: DirectoryProfile;
  connection: ConnectionInfo | undefined;
  isActing: boolean;
  onConnect: (id: string) => void;
  /** Accept a pending request from this person, straight from their card. */
  onAccept: (connectionId: string, requesterId: string) => void;
}) {
  const toast = useToast();
  const { averageRating, count } = useReviews(profile.id);
  const { hiredCount, jobsLandedCount } = useProfileStats(profile.id);

  const name = profile.full_name || "Unnamed";
  const typeLabel = signupTypeLabel(profile.signup_type);
  const specialty = [profile.trade, profile.classification].filter(Boolean).join(" · ");
  const about = profile.bio || profile.company_description;

  async function handleViewResume() {
    if (!profile.resume_path) return;

    const { error, url } = await getResumeSignedUrl(profile.resume_path);

    if (error || !url) {
      toast.error(error || "You may need to connect with this person first to view their resume.");
      return;
    }

    window.open(url, "_blank");
  }

  const hasTrust =
    profile.employer_verified || profile.union_status || count > 0 || hiredCount > 0 || jobsLandedCount > 0;

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 transition-colors hover:border-zinc-700">
      {/* One row: who they are on the left, the one action on the right. The
          action used to sit alone on a row of its own under the card, which
          made every card taller and left the button looking stranded. */}
      <div className="flex items-start gap-3">
        <Link href={`/dashboard/profile/${profile.id}`} className="shrink-0 rounded-full" tabIndex={-1} aria-hidden="true">
          <Avatar name={name} photoPath={profile.company_logo_path} />
        </Link>

        <div className="min-w-0 flex-1">
          {/* The shield sits against the name — it is the fact that most
              distinguishes one contractor from another. It draws only for an
              account holding a verified licence or business badge. */}
          <h2 className="flex items-center font-semibold leading-snug text-white">
            <Link href={`/dashboard/profile/${profile.id}`} className="truncate hover:underline">
              {name}
            </Link>
            <VerifiedMark profileId={profile.id} />
          </h2>
          <p className="truncate text-sm text-gray-300">
            {[typeLabel, specialty].filter(Boolean).join(" · ") || " "}
          </p>
          {(profile.location || profile.years_experience) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
              {profile.location && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="mapPin" className="h-3.5 w-3.5" />
                  {profile.location}
                </span>
              )}
              {/* A band since 20260918120000 — the unit is in the value. */}
              {profile.years_experience && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  {profile.years_experience}
                </span>
              )}
            </p>
          )}
        </div>

        <PrimaryAction
          profileId={profile.id}
          connection={connection}
          isActing={isActing}
          onConnect={onConnect}
          onAccept={onAccept}
        />
      </div>

      {(hasTrust || profile.resume_path) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <EmployerVerifiedBadge verified={!!profile.employer_verified} />
          <UnionBadge status={profile.union_status} verified={profile.union_verified || false} />
          {/* Reviews only when there are some. "No reviews yet" says nothing
              about the person and used to take the most prominent spot. */}
          {count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-0.5 text-xs font-semibold text-white">
              <Icon name="star" className="h-3.5 w-3.5 text-accent" />
              {averageRating}
              <span className="font-normal text-gray-500">({count})</span>
            </span>
          )}
          {hiredCount > 0 && (
            <span className="text-xs text-gray-400">
              Hired {hiredCount} {hiredCount === 1 ? "person" : "people"}
            </span>
          )}
          {jobsLandedCount > 0 && (
            <span className="text-xs text-gray-400">
              {jobsLandedCount} {jobsLandedCount === 1 ? "job" : "jobs"} landed
            </span>
          )}
          {profile.resume_path && (
            <button
              type="button"
              onClick={handleViewResume}
              className="-my-3 ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-accent-2-soft transition hover:text-white"
            >
              <Icon name="document" className="h-3.5 w-3.5" />
              Résumé
            </button>
          )}
        </div>
      )}

      {about && <p className="mt-2 line-clamp-2 text-sm text-gray-400">{about}</p>}
    </article>
  );
}

/**
 * The one action, sized to sit in the card's header row rather than own a
 * row. Connect is the primary; the other states are quieter because there is
 * nothing to do (sent) or it is a follow-up (message).
 */
const PRIMARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50";
const SECONDARY =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-white transition hover:border-zinc-500 disabled:opacity-50";

function PrimaryAction({
  profileId,
  connection,
  isActing,
  onConnect,
  onAccept,
}: {
  profileId: string;
  connection: ConnectionInfo | undefined;
  isActing: boolean;
  onConnect: (id: string) => void;
  onAccept: (connectionId: string, requesterId: string) => void;
}) {
  if (!connection) {
    return (
      <button type="button" onClick={() => onConnect(profileId)} disabled={isActing} className={PRIMARY}>
        {isActing ? <ButtonSpinner active /> : <Icon name="userPlus" />}
        {isActing ? "Sending" : "Connect"}
      </button>
    );
  }

  if (connection.status === "accepted") {
    return <MessagePersonButton otherUserId={profileId} className={SECONDARY} />;
  }

  if (connection.status === "pending" && connection.direction === "received") {
    return (
      <button
        type="button"
        onClick={() => onAccept(connection.id, profileId)}
        disabled={isActing}
        className={PRIMARY}
      >
        <Icon name="check" />
        Accept
      </button>
    );
  }

  return (
    <span className="inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-xs text-gray-500">
      {connection.status === "pending" ? (
        <>
          <Icon name="clock" className="h-3.5 w-3.5" />
          Sent
        </>
      ) : (
        "Not connected"
      )}
    </span>
  );
}
