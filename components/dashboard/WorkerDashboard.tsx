import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatsRow } from "./StatsRow";

export function WorkerDashboard({
  xp,
  completionPercentage,
}: {
  xp: number;
  completionPercentage: number;
}) {
  return (
    <>
      <StatsRow
        stats={[
          { label: "XP Points", value: xp, accent: true },
          { label: "Profile", value: `${completionPercentage}%` },
          { label: "Jobs Near You", value: 0 },
          { label: "Applications", value: 0 },
        ]}
      />

      <Card className="mb-8">
        <h2 className="text-2xl font-bold mb-5">Recent Activity</h2>
        <ul className="space-y-3 text-gray-300">
          <li>• Welcome to Sparx Plug.</li>
          <li>• Complete your profile.</li>
          <li>• Browse available jobs near you.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="text-2xl font-bold mb-5">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard/profile" className="bg-white text-black px-5 py-3 rounded-lg font-semibold">
            Complete Profile
          </Link>
          <Link href="/dashboard/jobs" className="border border-white px-5 py-3 rounded-lg">
            Browse Jobs
          </Link>
          <Link href="/dashboard/marketplace" className="border border-white px-5 py-3 rounded-lg">
            Grow Network
          </Link>
        </div>
      </Card>
    </>
  );
}