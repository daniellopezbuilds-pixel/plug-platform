"use client";

import { useActiveRole } from "@/hooks/useActiveRole";
import { WorkerDashboard } from "@/components/dashboard/WorkerDashboard";
import { EmployerDashboard } from "@/components/dashboard/EmployerDashboard";
import { BrandDashboard } from "@/components/dashboard/BrandDashboard";
import { signupTypeLabel } from "@/lib/signupRoles";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageLoader } from "@/components/ui/Loading";
import { ProfileCompletionBanner } from "@/components/dashboard/ProfileCompletionBanner";
import { profileCompletionPercentage } from "@/lib/profileCompletion";

export default function DashboardPage() {
  const { profile, loading } = useActiveRole();

  if (loading || !profile) {
    return <PageLoader message="Loading your dashboard" />;
  }

  // ONE DEFINITION, shared with the banner below. This used to be an inline
  // count over full_name, username, trade, bio and email — a different list
  // from the banner's, which is how the dashboard came to show "100%" directly
  // above "Your profile is missing one thing". Both now call the same function
  // on the same row, so they cannot disagree. See lib/profileCompletion.tsx.
  const completionPercentage = profileCompletionPercentage(profile);

  // "SP-000001 · C-10 contractor · Worker mode"
  //
  // Brands show no mode — they have no switcher. Accounts created before this
  // signup form carry no signup_type, so they keep the old behaviour of
  // printing active_role rather than showing a gap.
  const typeLabel = signupTypeLabel(profile.signup_type);
  const modeLabel =
    profile.active_role === "employer" ? "Employer mode" : "Worker mode";

  const subtitle = !typeLabel
    ? `${profile.profile_number} • ${profile.active_role}`
    : profile.signup_type === "brand"
    ? `${profile.profile_number} · ${typeLabel}`
    : `${profile.profile_number} · ${typeLabel} · ${modeLabel}`;

  return (
    <div>
      <PageHeading
        title={`Welcome back, ${profile.full_name || "User"}`}
        subtitle={subtitle}
      />

      {/* Under the heading, above the dashboard proper, and it renders nothing
          at all for a complete profile, a brand, or anyone who has dismissed
          it. The component decides — this page does not branch on it, so there
          is one place the rule lives. */}
      <ProfileCompletionBanner userId={profile.id} profile={profile} />

      {/* Brands carry role 'employer' so the signup trigger works unchanged,
          which would otherwise show them job and applicant stats. Branch on
          signup_type first. */}
      {profile.signup_type === "brand" ? (
        <BrandDashboard />
      ) : (
        <>
          {profile.active_role === "worker" && (
            <WorkerDashboard xp={profile.xp || 0} completionPercentage={completionPercentage} />
          )}
          {profile.active_role === "employer" && <EmployerDashboard />}
        </>
      )}
    </div>
  );
}