"use client";

import { useDashboardProfile } from "@/components/layout/DashboardProfile";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { PageHeading } from "@/components/layout/PageHeading";
import { AttentionCard } from "@/components/dashboard/AttentionCard";
import { WorkerDashboardMain, WorkerStats } from "@/components/dashboard/WorkerDashboard";
import { EmployerDashboardMain, EmployerStats } from "@/components/dashboard/EmployerDashboard";
import { BrandCampaignsCard } from "@/components/dashboard/BrandDashboard";
import { ProfileSummaryCard } from "@/components/feed/FeedRail";
import { PageLoader } from "@/components/ui/Loading";
import { signupTypeLabel } from "@/lib/signupRoles";
import { profileCompletionPercentage } from "@/lib/profileCompletion";

/**
 * The dashboard.
 *
 * WHAT IT IS FOR. The first screen after logging in, so it answers two
 * questions in order: is anything waiting for me (AttentionCard), and what
 * should I do next — jobs asking for my classification if I am working, my
 * job posts and who has applied if I am hiring, my campaigns if I am a brand.
 * It used to lead with four stat tiles and three buttons, which answered
 * neither.
 *
 * The numbers are still here, in the rail, and each now links to the page
 * behind it. Below 1280 they follow the main column.
 *
 * READS THE PROFILE FROM THE LAYOUT (DashboardProfile context) rather than
 * calling useActiveRole() again — the layout has already fetched it, and it
 * updates when the mode switcher changes it.
 */
export default function DashboardPage() {
  const profile = useDashboardProfile();
  const { withRail } = useRailBreakpoints();

  if (!profile) {
    return <PageLoader message="Loading your dashboard" />;
  }

  const isBrand = profile.signup_type === "brand";
  const isEmployer = profile.active_role === "employer";
  const name = (isBrand ? profile.brand_name : null) || profile.full_name || "there";

  const typeLabel = signupTypeLabel(profile.signup_type);
  const modeLabel = isEmployer ? "Employer mode" : "Worker mode";
  const subtitle = [
    profile.profile_number,
    typeLabel,
    !isBrand && typeLabel ? modeLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Brands carry role 'employer' so the signup trigger works unchanged, which
  // would otherwise show them job and applicant stats. Branch on signup_type
  // first.
  const stats = isBrand ? null : isEmployer ? (
    <EmployerStats />
  ) : (
    <WorkerStats
      xp={profile.xp || 0}
      completionPercentage={profileCompletionPercentage(profile)}
    />
  );

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      rightLabel="Your profile and numbers"
      right={
        <>
          <ProfileSummaryCard />
          {stats}
        </>
      }
    >
      <PageHeading title={`Welcome back, ${name}`} size="compact" subtitle={subtitle} />

      <div className="space-y-4">
        <AttentionCard profile={profile} />

        {isBrand ? (
          <BrandCampaignsCard userId={profile.id} />
        ) : isEmployer ? (
          <EmployerDashboardMain />
        ) : (
          <WorkerDashboardMain />
        )}

        {!withRail && stats}
      </div>
    </RailColumns>
  );
}
