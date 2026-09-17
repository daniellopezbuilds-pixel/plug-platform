"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatsRow } from "./StatsRow";
import { RecentActivity } from "./RecentActivity";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useDashboardStats } from "@/hooks/useDashboardStats";

export function EmployerDashboard() {
  const { employer } = useDashboardStats("employer");

  return (
    <>
      <StatsRow
        stats={[
          // "Active" is every job you have posted. jobs has no status column
          // and nothing closes a listing, so there is no inactive state for
          // this to exclude — if one is added, this is the count to revisit.
          { label: "Active Jobs", value: employer.activeJobs },
          { label: "Applicants", value: employer.applicants },
          { label: "Hires", value: employer.hires },
          { label: "Connections", value: employer.connections },
        ]}
      />

      {/* Side by side from xl — see the note in WorkerDashboard. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <RecentActivity mode="employer" />

        <Card>
          <SectionHeading>Quick Actions</SectionHeading>
          <div className="flex flex-wrap gap-4">
            <Link href="/dashboard/jobs/create" className="bg-accent text-on-accent px-5 py-3 rounded-lg font-semibold">
              Post Job
            </Link>
            <Link href="/dashboard/applicants" className="border border-zinc-700 text-white px-5 py-3 rounded-lg hover:bg-zinc-900 transition">
              View Applicants
            </Link>
            <Link href="/dashboard/marketplace" className="border border-zinc-700 text-white px-5 py-3 rounded-lg hover:bg-zinc-900 transition">
              Grow Network
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
