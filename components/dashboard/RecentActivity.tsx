"use client";

import Link from "next/link";
import { RailCard, RailSkeleton } from "@/components/layout/RailCard";
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
 *
 * In the same panel frame as the rest of the dashboard, with each row a full
 * 44px link rather than a line of text.
 */
export function RecentActivity({ mode }: { mode: Mode }) {
  const { items, loading } = useRecentActivity(mode);

  return (
    <RailCard title="Recent activity">
      {loading ? (
        <RailSkeleton rows={3} />
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">
          {mode === "employer" ? (
            <>
              Activity shows up here once you{" "}
              <Link href="/dashboard/jobs/create" className="text-accent-2-soft hover:text-white">
                post a job
              </Link>{" "}
              and people start applying.
            </>
          ) : (
            <>
              Activity shows up here once you{" "}
              <Link href="/dashboard/jobs" className="text-accent-2-soft hover:text-white">
                apply for a job
              </Link>{" "}
              or connect with someone.
            </>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-11 items-baseline justify-between gap-4 px-4 py-2.5 text-sm text-gray-300 transition hover:bg-zinc-900 hover:text-white"
              >
                <span className="min-w-0">{item.text}</span>
                <span className="shrink-0 text-xs text-gray-500">{timeAgo(item.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}
