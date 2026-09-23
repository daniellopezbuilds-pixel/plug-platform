"use client";

import { RailCard } from "@/components/layout/RailCard";
import type { ApplicationCounts } from "@/hooks/useMyApplicationCounts";

/**
 * Where your applications stand, beside the jobs you might apply to next.
 *
 * Three numbers and a link. Accepted is in accent because it is the one that
 * needs you to do something — reply to the employer.
 */
export function ApplicationsSummaryCard({ counts }: { counts: ApplicationCounts | null }) {
  const stats = [
    { label: "Waiting", value: counts?.pending, tone: "text-white" },
    { label: "Accepted", value: counts?.accepted, tone: "text-accent" },
    { label: "Declined", value: counts?.rejected, tone: "text-gray-400" },
  ];

  return (
    <RailCard
      title="Your applications"
      action={{ href: "/dashboard/applications", label: "View all" }}
    >
      {counts && counts.total === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">
          You have not applied to anything yet. Open a job to see the full
          details and apply.
        </p>
      ) : (
        <dl className="grid grid-cols-3 divide-x divide-zinc-800">
          {stats.map((s) => (
            // Label first in the DOM, as a <dl> requires; drawn under the
            // number by flex-col-reverse, since the number is what is scanned.
            <div key={s.label} className="flex flex-col-reverse px-3 py-3 text-center">
              <dt className="text-xs text-gray-500">{s.label}</dt>
              <dd className={`text-2xl font-bold ${s.tone}`}>
                {counts ? s.value : <span className="text-gray-600">–</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </RailCard>
  );
}
