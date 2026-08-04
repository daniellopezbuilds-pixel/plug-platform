"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { getBrandingPublicUrl } from "@/lib/branding";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";

export function ProfilePreviewModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [trade, setTrade] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [unionStatus, setUnionStatus] = useState<string | null>(null);
  const [unionVerified, setUnionVerified] = useState(false);
  const [yearsExperience, setYearsExperience] = useState<string | null>(null);

  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyDescription, setCompanyDescription] = useState("");
  const [employerVerified, setEmployerVerified] = useState(false);
  const [accountType, setAccountType] = useState<string | null>(null);

  const { reviews, averageRating, count } = useReviews(userId || null);
  const { hiredCount, jobsLandedCount } = useProfileStats(userId || null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!profile) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setProfileNumber(profile.profile_number || "");
      setFullName(profile.full_name || "");
      setTrade(profile.trade || "");
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setUnionStatus(profile.union_status || null);
      setUnionVerified(profile.union_verified || false);
      setYearsExperience(profile.years_experience?.toString() || null);
      setAccountType(profile.account_type || profile.role || null);

      setCompanyLogoPath(profile.company_logo_path || null);
      setCompanyDescription(profile.company_description || "");
      setEmployerVerified(profile.employer_verified || false);

      setLoading(false);
    }

    if (userId) loadProfile();
  }, [userId]);

  const isEmployer = accountType === "employer";

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl"
        >
          ✕
        </button>

        {loading ? (
          <p className="text-gray-400">Loading profile...</p>
        ) : notFound ? (
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Profile Not Found</h2>
            <p className="text-gray-400">This user's profile is unavailable.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              {companyLogoPath && (
                <img
                  src={getBrandingPublicUrl(companyLogoPath)}
                  alt="Company logo"
                  className="w-16 h-16 rounded-full object-cover border border-zinc-700"
                />
              )}
              <div>
                <h2 className="text-2xl font-bold text-white">{fullName || "User"}</h2>
                <p className="text-gray-400 text-sm mt-1">
                  {profileNumber}
                  {trade && ` · ${trade}`}
                  {location && ` · ${location}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              {unionStatus && <UnionBadge status={unionStatus} verified={unionVerified} />}
              {isEmployer && employerVerified && (
                <span className="bg-green-950 text-green-400 border border-green-800 px-3 py-1 rounded-full text-xs font-semibold">
                  Verified Employer
                </span>
              )}
            </div>

            {bio && <p className="text-gray-300 whitespace-pre-wrap mb-4">{bio}</p>}

            {yearsExperience && (
              <p className="text-gray-400 text-sm mb-4">
                {yearsExperience} years of experience
              </p>
            )}

            {isEmployer && companyDescription && (
              <div className="mb-4">
                <h3 className="text-white font-semibold mb-1">About the Company</h3>
                <p className="text-gray-300 whitespace-pre-wrap text-sm">
                  {companyDescription}
                </p>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Reputation</h3>
                <ReviewSummary averageRating={averageRating} count={count} />
              </div>

              {(hiredCount > 0 || jobsLandedCount > 0) && (
                <div className="flex flex-wrap gap-2 mb-4">
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

              <ReviewsList reviews={reviews} />
            </div>

            <Link
              href={`/dashboard/profile/${userId}`}
              className="block text-center mt-5 text-yellow-400 hover:text-yellow-300 text-sm font-semibold"
            >
              View Full Profile →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}