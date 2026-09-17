"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { timeAgo } from "@/lib/relativeTime";
import type { Mode } from "@/lib/accountModes";

/**
 * Recent Activity, from actual activity.
 *
 * Replaces three hardcoded bullets that were identical on every account. The
 * empty state below is the honest version of what those bullets were pretending
 * to be — a prompt for an account that has not done anything yet — and it is
 * now shown only to accounts that genuinely have not.
 */
export function RecentActivity({ mode }: { mode: Mode }) {
  const { items, loading } = useRecentActivity(mode);

  return (
    <Card>
      <SectionHeading>Recent Activity</SectionHeading>

      {loading ? (
        // Two muted bars at roughly the height of two rows, so the card does
        // not resize under the reader when the queries land.
        <div aria-hidden="true" className="space-y-3">
          <div className="h-4 w-3/4 rounded bg-zinc-800" />
          <div className="h-4 w-1/2 rounded bg-zinc-800" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 space-y-2">
          <p>Nothing yet.</p>
          <p className="text-sm">
            {mode === "employer" ? (
              <>
                Activity shows up here once you{" "}
                <Link
                  href="/dashboard/jobs/create"
                  className="text-accent-2-soft hover:text-white"
                >
                  post a job
                </Link>{" "}
                and people start applying.
              </>
            ) : (
              <>
                Activity shows up here once you{" "}
                <Link
                  href="/dashboard/jobs"
                  className="text-accent-2-soft hover:text-white"
                >
                  apply for a job
                </Link>{" "}
                or connect with someone.
              </>
            )}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-baseline justify-between gap-4 text-gray-300 hover:text-white transition"
              >
                <span className="min-w-0">{item.text}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  {timeAgo(item.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
