"use client";

import Link from "next/link";
import { RailCard, RailSkeleton } from "@/components/layout/RailCard";
import { Icon } from "@/components/ui/Icon";
import { useMatchingJobs } from "@/hooks/useMatchingJobs";
import { useMyJobPosts } from "@/hooks/useMyJobPosts";
import { formatPay } from "@/lib/jobs";
import { timeAgo } from "@/lib/relativeTime";

/**
 * The worker's "what next": jobs asking for their classification.
 *
 * Labelled with the classification it matched on, so the list says exactly
 * what it is. A profile with no classification gets the newest jobs and a
 * line saying why they are not matched.
 */
export function MatchingJobsCard() {
  const { jobs, classification, loading } = useMatchingJobs(5);

  return (
    <RailCard
      title={classification ? `Jobs for ${classification}` : "Newest jobs"}
      action={{ href: "/dashboard/jobs", label: "All jobs" }}
    >
      {loading ? (
        <RailSkeleton rows={3} />
      ) : (
        <>
          {!classification && (
            <p className="border-b border-zinc-800 px-4 py-2 text-xs text-gray-400">
              Add your classification to your{" "}
              <Link href="/dashboard/profile" className="text-accent-2-soft hover:text-white">
                profile
              </Link>{" "}
              to see jobs that ask for it.
            </p>
          )}
          {jobs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400">
              {classification
                ? `No open jobs are asking for ${classification} right now.`
                : "No open jobs right now."}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {jobs.map((job) => {
                const pay = formatPay(job);
                const meta = [job.company, job.location].filter(Boolean).join(" · ");
                return (
                  <li key={job.id}>
                    <Link
                      href={`/dashboard/jobs?job=${job.id}`}
                      className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-900"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{job.title}</span>
                        <span className="block truncate text-xs text-gray-400">
                          {meta || " "}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {pay && <span className="block text-sm font-semibold text-accent">{pay}</span>}
                        <span className="block text-xs text-gray-500">{timeAgo(job.created_at)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </RailCard>
  );
}

/** The employer's "what next": their posts, and who has applied to each. */
export function MyJobPostsCard() {
  const { posts, loading } = useMyJobPosts(6);

  return (
    <RailCard title="Your job posts" action={{ href: "/dashboard/applicants", label: "Applicants" }}>
      {loading ? (
        <RailSkeleton rows={3} />
      ) : posts.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm text-gray-400">
            You have not posted a job yet. Posts appear on the Jobs Board as
            soon as they are published.
          </p>
          <Link
            href="/dashboard/jobs/create"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
          >
            <Icon name="plus" className="h-4 w-4" />
            Post a job
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-zinc-800">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href="/dashboard/applicants"
                  className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{post.title}</span>
                    <span className="block truncate text-xs text-gray-400">
                      {[post.location, `posted ${timeAgo(post.created_at)}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-white">
                      {post.applicants}{" "}
                      <span className="font-normal text-gray-500">
                        {post.applicants === 1 ? "applicant" : "applicants"}
                      </span>
                    </span>
                    {post.waiting > 0 && (
                      <span className="block text-xs font-semibold text-accent">
                        {post.waiting} waiting
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-800 px-4 py-2">
            <Link
              href="/dashboard/jobs/create"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent-2-soft transition hover:text-white"
            >
              <Icon name="plus" className="h-4 w-4" />
              Post another job
            </Link>
          </div>
        </>
      )}
    </RailCard>
  );
}

/**
 * Numbers, each a link to the page that explains it. A list rather than a
 * <dl>: a definition list cannot contain links wrapping its terms.
 */
export function StatsCard({
  stats,
}: {
  stats: { label: string; value: number | string | null; href?: string }[];
}) {
  return (
    <RailCard title="At a glance">
      {/* gap-px over a zinc-800 background draws the dividers between cells
          at any column count, without per-cell border arithmetic. */}
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-zinc-800">
        {stats.map((s) => {
          const body = (
            <>
              <span className="block text-2xl font-bold text-white">
                {s.value ?? <span className="text-gray-600">–</span>}
              </span>
              <span className="block text-xs text-gray-500">{s.label}</span>
            </>
          );
          return (
            <li key={s.label} className="bg-zinc-950">
              {s.href ? (
                <Link href={s.href} className="block min-h-11 px-4 py-3 transition hover:bg-zinc-900">
                  {body}
                </Link>
              ) : (
                <div className="px-4 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </RailCard>
  );
}
