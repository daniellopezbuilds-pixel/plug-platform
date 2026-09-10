import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatsRow } from "./StatsRow";
import { SectionHeading } from "@/components/ui/SectionHeading";

export function EmployerDashboard() {
  return (
    <>
      <StatsRow
        stats={[
          { label: "Active Jobs", value: 0 },
          { label: "Applicants", value: 0 },
          { label: "Hires", value: 0 },
          { label: "Connections", value: 0 },
        ]}
      />

      <Card className="mb-8">
        <SectionHeading>Recent Activity</SectionHeading>
        <ul className="space-y-3 text-gray-300">
          <li>• Welcome to Sparx Plug.</li>
          <li>• Create your first job posting.</li>
          <li>• Build your contractor network.</li>
        </ul>
      </Card>

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
    </>
  );
}