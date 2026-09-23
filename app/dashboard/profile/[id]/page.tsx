"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";
import { PageLoader } from "@/components/ui/Loading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { MessagePersonButton } from "@/components/messaging/MessagePersonButton";
import { EmployerVerifiedBadge } from "@/components/ui/EmployerVerifiedBadge";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useConnections } from "@/hooks/useConnections";

export default function PublicProfilePage() {
  const params = useParams();
  const profileId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [trade, setTrade] = useState("");
  const [classification, setClassification] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [signupType, setSignupType] = useState<string | null>(null);
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
  const { connectionMap, actingId, sendRequest, respondToRequest } = useConnections();
  const { withRail } = useRailBreakpoints();
  const toast = useToast();

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
      setClassification(profile.classification || null);
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setSignupType(profile.signup_type || null);
      setUnionStatus(profile.union_status || null);
      setUnionVerified(profile.union_verified || false);
      setYearsExperience(profile.years_experience || null);
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
    return <PageLoader message="Loading profile" />;
  }

  if (notFound) {
    return (
      <div className="text-white">
        <h1 className="mb-2 text-2xl font-bold">Profile not found</h1>
        <p className="text-gray-400">This user doesn&apos;t exist or their profile is unavailable.</p>
      </div>
    );
  }

  const isEmployer = accountType === "employer";
  const connection = connectionMap.get(profileId);

  async function handleConnect() {
    const { error } = await sendRequest(profileId);
    if (error) toast.error(error);
  }

  async function handleAccept() {
    if (!connection) return;
    const { error } = await respondToRequest(connection.id, profileId, "accepted");
    if (error) toast.error(error);
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {!connection ? (
        <button
          type="button"
          onClick={handleConnect}
          disabled={actingId === profileId}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          <Icon name="userPlus" />
          Connect
        </button>
      ) : connection.status === "accepted" ? (
        <MessagePersonButton
          otherUserId={profileId}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        />
      ) : connection.status === "pending" && connection.direction === "received" ? (
        <button
          type="button"
          onClick={handleAccept}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
        >
          <Icon name="check" />
          Accept connection request
        </button>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-1.5 text-sm text-gray-400">
          <Icon name="clock" />
          {connection.status === "pending" ? "Connection request sent" : "Not connected"}
        </span>
      )}
    </div>
  );

  const trust = (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">Reputation</h2>
        <ReviewSummary averageRating={averageRating} count={count} />
      </header>
      {(employerVerified || unionStatus) && (
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-4 py-3">
          <EmployerVerifiedBadge verified={isEmployer && employerVerified} />
          <UnionBadge status={unionStatus} verified={unionVerified} />
        </div>
      )}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-zinc-800">
        <li className="bg-zinc-950 px-4 py-3">
          <span className="block text-2xl font-bold text-white">{hiredCount}</span>
          <span className="block text-xs text-gray-500">People hired</span>
        </li>
        <li className="bg-zinc-950 px-4 py-3">
          <span className="block text-2xl font-bold text-white">{jobsLandedCount}</span>
          <span className="block text-xs text-gray-500">Jobs landed</span>
        </li>
      </ul>
    </section>
  );

  return (
    /* FULL WIDTH, WITH THE TRUST SIGNALS BESIDE IT. This was a 672px column
       centred on the page. The profile itself is a reading surface and is
       capped at 800px; the rail beside it takes the rest and holds what a
       reader is deciding on — how to reach this person, whether they are
       verified, and their record — as LinkedIn's profile keeps those beside
       the content rather than under it. */
    <RailColumns
      withRail={withRail}
      split={false}
      mainMax={800}
      rightLabel="Connect and reputation"
      right={
        <>
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">{actions}</section>
          {trust}
        </>
      }
    >
      <ProfileHeader
        profileId={profileId}
        fullName={fullName}
        profileNumber={profileNumber}
        signupType={signupType}
        companyLogoPath={companyLogoPath}
        companyBannerPath={companyBannerPath}
        trade={trade}
        classification={classification}
        location={location}
        yearsExperience={yearsExperience}
        unionStatus={unionStatus}
        unionVerified={unionVerified}
        bio={bio}
      />

      {!withRail && (
        <div className="mt-4 space-y-4">
          {actions}
          {trust}
        </div>
      )}

      {isEmployer && companyDescription && (
        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-white">About the company</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {companyDescription}
          </p>
          {companyWebsite && (
            <a
              href={companyWebsite.startsWith("http") ? companyWebsite : `https://${companyWebsite}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-2-soft transition hover:text-white"
            >
              <Icon name="link" />
              {companyWebsite}
            </a>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Reviews</h2>
        <ReviewsList reviews={reviews} />
      </section>
    </RailColumns>
  );
}
