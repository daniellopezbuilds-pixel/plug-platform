"use client";

import { StatsCard, MyJobPostsCard } from "./DashboardLists";
import { RecentActivity } from "./RecentActivity";
import { useDashboardStats } from "@/hooks/useDashboardStats";

/**
 * The employer's main column: their job posts with applicant counts beside
 * recent activity. Two-up once the column is 768px wide.
 */
export function EmployerDashboardMain() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 @3xl:grid-cols-2">
      <MyJobPostsCard />
      <RecentActivity mode="employer" />
    </div>
  );
}

/** The employer's numbers, each linked to the page that explains it. */
export function EmployerStats() {
  const { employer } = useDashboardStats("employer");

  return (
    <StatsCard
      stats={[
        { label: "Job posts", value: employer.activeJobs, href: "/dashboard/applicants" },
        { label: "Applicants", value: employer.applicants, href: "/dashboard/applicants" },
        { label: "Hires", value: employer.hires, href: "/dashboard/applicants" },
        { label: "Connections", value: employer.connections, href: "/dashboard/marketplace" },
      ]}
    />
  );
}
