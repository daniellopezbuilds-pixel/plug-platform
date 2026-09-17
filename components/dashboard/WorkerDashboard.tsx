"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatsRow } from "./StatsRow";
import { RecentActivity } from "./RecentActivity";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useDashboardStats } from "@/hooks/useDashboardStats";

export function WorkerDashboard({
  xp,
  completionPercentage,
}: {
  xp: number;
  completionPercentage: number;
}) {
  const { worker } = useDashboardStats("worker");

  return (
    <>
      <StatsRow
        stats={[
          { label: "XP Points", value: xp, accent: true },
          { label: "Profile", value: `${completionPercentage}%` },
          {
            // The label tells the truth about what was counted. Location on
            // both profiles and jobs is free text with no geocoding, so
            // "near you" is a match on the city and state written in the
            // profile — and when there is no location to match on, this counts
            // every open job and says that instead of showing a filtered
            // number the reader would misread as proximity.
            label: worker.isLocationFiltered ? "Jobs Near You" : "Open Jobs",
            value: worker.nearbyJobs,
          },
          { label: "Applications", value: worker.applications },
        ]}
      />

      {/* Side by side from xl. Stacked, these are two short cards running the
          full width of a 1600px container — the definition of the sparse look
          this was meant to fix. The stats row above already spans, as a grid. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <RecentActivity mode="worker" />

        <Card>
          <SectionHeading>Quick Actions</SectionHeading>
          <div className="flex flex-wrap gap-4">
            <Link href="/dashboard/profile" className="bg-accent text-on-accent px-5 py-3 rounded-lg font-semibold">
              Complete Profile
            </Link>
            <Link href="/dashboard/jobs" className="border border-zinc-700 text-white px-5 py-3 rounded-lg hover:bg-zinc-900 transition">
              Browse Jobs
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
