"use client";

import { StatsCard, MatchingJobsCard } from "./DashboardLists";
import { RecentActivity } from "./RecentActivity";
import { useDashboardStats } from "@/hooks/useDashboardStats";

/**
 * The worker's main column: jobs asking for their classification beside
 * what has happened recently. Two-up once the column is 768px wide (a
 * container query), stacked below that.
 */
export function WorkerDashboardMain() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2">
      <MatchingJobsCard />
      <RecentActivity mode="worker" />
    </div>
  );
}

/** The worker's numbers, each linked to the page that explains it. */
export function WorkerStats({
  xp,
  completionPercentage,
}: {
  xp: number;
  completionPercentage: number;
}) {
  const { worker } = useDashboardStats("worker");

  return (
    <StatsCard
      stats={[
        {
          label: worker.isLocationFiltered ? "Jobs near you" : "Open jobs",
          value: worker.nearbyJobs,
          href: "/dashboard/jobs",
        },
        { label: "Applications", value: worker.applications, href: "/dashboard/applications" },
        { label: "Profile", value: `${completionPercentage}%`, href: "/dashboard/profile" },
        { label: "XP", value: xp },
      ]}
    />
  );
}
