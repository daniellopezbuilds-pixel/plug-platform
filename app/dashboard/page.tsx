"use client";

import { useActiveRole } from "@/hooks/useActiveRole";
import { WorkerDashboard } from "@/components/dashboard/WorkerDashboard";
import { EmployerDashboard } from "@/components/dashboard/EmployerDashboard";
import { BrandDashboard } from "@/components/dashboard/BrandDashboard";
import { signupTypeLabel } from "@/lib/signupRoles";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageLoader } from "@/components/ui/Loading";

export default function DashboardPage() {
  const { profile, loading } = useActiveRole();

  if (loading || !profile) {
    return <PageLoader message="Loading your dashboard" />;
  }

  const completed = [
    profile.full_name,
    profile.username,
    profile.trade,
    profile.bio,
    profile.email,
  ].filter(Boolean).length;
  const completionPercentage = Math.round((completed / 5) * 100);

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