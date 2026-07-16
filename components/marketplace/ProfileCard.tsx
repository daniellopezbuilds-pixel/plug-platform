"use client";

import { Card } from "@/components/ui/Card";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { EmployerVerifiedBadge } from "@/components/ui/EmployerVerifiedBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { getResumeSignedUrl } from "@/lib/resume";
import { getBrandingPublicUrl } from "@/lib/branding";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";
import type { DirectoryProfile } from "@/hooks/useDirectory";
import type { ConnectionInfo } from "@/hooks/useConnections";

export function ProfileCard({
  profile,
  connection,
  isActing,
  onConnect,
}: {
  profile: DirectoryProfile;
  connection: ConnectionInfo | undefined;
  isActing: boolean;
  onConnect: (id: string) => void;
}) {
  const { averageRating, count } = useReviews(profile.id);
  const { hiredCount, jobsLandedCount } = useProfileStats(profile.id);

  const logoUrl = profile.company_logo_path ? getBrandingPublicUrl(profile.company_logo_path) : null;

  async function handleViewResume() {
    if (!profile.resume_path) return;

    const { error, url } = await getResumeSignedUrl(profile.resume_path);

    if (error || !url) {
      alert(error || "You may need to connect with this person first to view their resume.");
      return;
    }

    window.open(url, "_blank");
  }

  function renderButton() {
    if (!connection) {
      return (
        <button
          onClick={() => onConnect(profile.id)}
          disabled={isActing}
          className="bg-white text-black px-5 py-2.5 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50 transition"
        >
          {isActing ? "Sending..." : "Connect"}
        </button>
      );
    }

    if (connection.status === "accepted") {
      return (
        <span className="bg-green-950 text-green-400 border border-green-800 px-5 py-2.5 rounded-lg font-semibold text-sm">
          Connected ✓
        </span>
      );
    }

    if (connection.status === "pending" && connection.direction === "sent") {
      return (
        <span className="bg-zinc-800 text-gray-400 border border-zinc-700 px-5 py-2.5 rounded-lg font-semibold text-sm">
          Pending
        </span>
      );
    }

    if (connection.status === "pending" && connection.direction === "received") {
      return (
        <span className="bg-yellow-950 text-yellow-400 border border-yellow-800 px-5 py-2.5 rounded-lg font-semibold text-sm">
          Respond in Requests
        </span>
      );
    }

    if (connection.status === "rejected") {
      return (
        <span className="bg-zinc-800 text-gray-500 border border-zinc-700 px-5 py-2.5 rounded-lg font-semibold text-sm">
          Not Connected
        </span>
      );
    }

    return null;
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${profile.full_name || "Company"} logo`}
              className="w-10 h-10 rounded-full object-cover border border-zinc-700"
            />
          )}
          <div>
            <h2 className="text-xl font-bold text-white">{profile.full_name || "Unnamed"}</h2>
            <p className="text-gray-400 text-sm">{profile.profile_number}</p>
          </div>
        </div>
        <ReviewSummary averageRating={averageRating} count={count} />
      </div>

      {profile.employer_verified && (
        <div className="mb-3">
          <EmployerVerifiedBadge verified={profile.employer_verified} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {profile.trade && (
          <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
            {profile.trade}
          </span>
        )}
        {profile.location && (
          <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
            {profile.location}
          </span>
        )}
        {profile.years_experience !== null && profile.years_experience !== undefined && (
          <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
            {profile.years_experience} {profile.years_experience === 1 ? "year" : "years"} experience
          </span>
        )}
        {profile.union_status && (
          <UnionBadge status={profile.union_status} verified={profile.union_verified || false} />
        )}
      </div>

      {(hiredCount > 0 || jobsLandedCount > 0) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {hiredCount > 0 && (
            <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
              {hiredCount} {hiredCount === 1 ? "person" : "people"} hired
            </span>
          )}
          {jobsLandedCount > 0 && (
            <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
              {jobsLandedCount} {jobsLandedCount === 1 ? "job" : "jobs"} landed
            </span>
          )}
        </div>
      )}

      {profile.bio && <p className="text-zinc-300 mb-2">{profile.bio}</p>}
      {profile.company_description && (
        <p className="text-zinc-400 text-sm mb-4">{profile.company_description}</p>
      )}
      {profile.company_website && (
        <a
        
          href={
            profile.company_website.startsWith("http")
              ? profile.company_website
              : `https://${profile.company_website}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm block mb-4"
        >
          {profile.company_website} ↗
        </a>
      )}

      <div className="flex items-center gap-4">
        {renderButton()}
        {profile.resume_path && (
          <button
            onClick={handleViewResume}
            className="text-yellow-400 hover:text-yellow-300 text-sm font-semibold"
          >
            View Resume →
          </button>
        )}
      </div>
    </Card>
  );
}