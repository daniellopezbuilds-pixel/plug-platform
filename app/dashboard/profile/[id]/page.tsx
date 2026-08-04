"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { getBrandingPublicUrl } from "@/lib/branding";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";

export default function PublicProfilePage() {
  const params = useParams();
  const profileId = params.id as string;

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
  const [companyBannerPath, setCompanyBannerPath] = useState<string | null>(null);
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [employerVerified, setEmployerVerified] = useState(false);
  const [accountType, setAccountType] = useState<string | null>(null);

  const { reviews, averageRating, count } = useReviews(profileId || null);
  const { hiredCount, jobsLandedCount } = useProfileStats(profileId || null);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
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
      setCompanyBannerPath(profile.company_banner_path || null);
      setCompanyDescription(profile.company_description || "");
      setCompanyWebsite(profile.company_website || "");
      setEmployerVerified(profile.employer_verified || false);

      setLoading(false);
    }

    if (profileId) loadProfile();
  }, [profileId]);

  if (loading) {
    return <div className="text-white">Loading profile...</div>;
  }

  if (notFound) {
    return (
      <div className="text-white">
        <h1 className="text-3xl font-bold mb-2">Profile Not Found</h1>
        <p className="text-gray-400">This user doesn't exist or their profile is unavailable.</p>
      </div>
    );
  }

  const isEmployer = accountType === "employer";

  return (
    <div className="max-w-2xl">
      {companyBannerPath && (
        <img
          src={getBrandingPublicUrl(companyBannerPath)}
          alt="Company banner"
          className="w-full h-40 rounded-lg object-cover border border-zinc-800 mb-6"
        />
      )}

      <div className="flex items-center gap-4 mb-6">
        {companyLogoPath && (
          <img
            src={getBrandingPublicUrl(companyLogoPath)}
            alt="Company logo"
            className="w-16 h-16 rounded-full object-cover border border-zinc-700"
          />
        )}
        <div>
          <h1 className="text-4xl font-bold text-white">{fullName || "User"}</h1>
          <p className="text-gray-400 text-sm mt-1">
            {profileNumber}
            {trade && ` · ${trade}`}
            {location && ` · ${location}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {unionStatus && <UnionBadge status={unionStatus} verified={unionVerified} />}
        {isEmployer && employerVerified && (
          <span className="bg-green-950 text-green-400 border border-green-800 px-3 py-1 rounded-full text-xs font-semibold">
            Verified Employer
          </span>
        )}
      </div>

      {bio && (
        <div className="mb-6">
          <p className="text-gray-300 whitespace-pre-wrap">{bio}</p>
        </div>
      )}

      {yearsExperience && (
        <p className="text-gray-400 text-sm mb-6">{yearsExperience} years of experience</p>
      )}

      {isEmployer && companyDescription && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white mb-2">About the Company</h2>
          <p className="text-gray-300 whitespace-pre-wrap mb-3">{companyDescription}</p>
          {companyWebsite && (
            
              <a href={
                companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {companyWebsite}
            </a>
          )}
        </div>
      )}

      <div className="mt-8 border-t border-zinc-800 pt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">Reputation</h2>
          <ReviewSummary averageRating={averageRating} count={count} />
        </div>

        {(hiredCount > 0 || jobsLandedCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
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
    </div>
  );
}