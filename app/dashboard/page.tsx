"use client";

import { useActiveRole } from "@/hooks/useActiveRole";
import { WorkerDashboard } from "@/components/dashboard/WorkerDashboard";
import { EmployerDashboard } from "@/components/dashboard/EmployerDashboard";

export default function DashboardPage() {
  const { profile, loading } = useActiveRole();

  if (loading || !profile) {
    return <div className="text-white">Loading dashboard...</div>;
  }

  const completed = [
    profile.full_name,
    profile.username,
    profile.trade,
    profile.bio,
    profile.email,
  ].filter(Boolean).length;
  const completionPercentage = Math.round((completed / 5) * 100);

  return (
    <div>
      <h1 className="text-5xl font-bold mb-2">Welcome back, {profile.full_name || "User"}</h1>
      <p className="text-gray-400 mb-10">
        {profile.profile_number} • {profile.active_role}
      </p>

      {profile.active_role === "worker" && (
        <WorkerDashboard xp={profile.xp || 0} completionPercentage={completionPercentage} />
      )}
      {profile.active_role === "employer" && <EmployerDashboard />}
    </div>
  );
}