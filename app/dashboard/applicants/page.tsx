"use client";

import Link from "next/link";
import { useApplicants } from "@/hooks/useApplicants";
import { useApplicantCounts } from "@/hooks/useApplicantCounts";
import { useMyJobPosts } from "@/hooks/useMyJobPosts";
import { ApplicantCard } from "@/components/applications/ApplicantCard";
import { StatusTabs } from "@/components/applications/StatusTabs";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListError } from "@/components/ui/ListError";
import { FIELD_CONTROL } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { LoadMore } from "@/components/ui/LoadMore";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { MyJobPost } from "@/hooks/useMyJobPosts";
import { useMarkNotificationsRead } from "@/hooks/useMarkNotificationsRead";

const NEW_APPLICANT_TYPES = ["new_applicant"] as const;

/**
 * Applicants.
 *
 * JOB, THEN STATUS. Every applicant for every job used to be one undivided
 * list. An employer reviews one role at a time, so the jobs are a picker —
 * the left rail from 1280px, a select above the list below that — each with
 * its applicant count and how many are still waiting. Status tabs then narrow
 * within the job. Both filters are in the query, so paging keeps working.
 *
 * Borrowed from applicant trackers (Greenhouse, Indeed Employer): job on the
 * left, pipeline on the right. Not borrowed: a kanban board — three statuses
 * do not need columns you drag between.
 */
export default function ApplicantsPage() {
  const toast = useToast();
  const {
    applicants,
    reviewedIds,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    updatingId,
    updateStatus,
    refresh,
    jobId,
    setJobId,
    status,
    setStatus,
    error,
    reload,
  } = useApplicants();
  // Decisions so far, as a key: the picker and the tab counts both recount
  // when any applicant moves, so neither shows a number from page load.
  const decisionKey = applicants.map((a) => `${a.id}:${a.status}`).join();
  const { posts } = useMyJobPosts(50, decisionKey);
  // Opening this page reads the new-applicant notifications, so the sidebar
  // badge stops counting applicants you are already looking at.
  useMarkNotificationsRead(NEW_APPLICANT_TYPES);
  const { withRail } = useRailBreakpoints();

  const counts = useApplicantCounts(jobId, decisionKey);

  async function handleUpdate(id: string, next: "accepted" | "rejected" | "pending") {
    const { error } = await updateStatus(id, next);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      next === "accepted"
        ? "Applicant accepted. They have been notified."
        : next === "rejected"
        ? "Applicant declined. They have been notified."
        : "Decision undone. The application is back to New."
    );
  }

  const selectedJob = posts.find((p) => p.id === jobId);

  return (
    <RailColumns
      withRail={withRail}
      split={withRail}
      leftLabel="Your jobs"
      left={<JobPicker posts={posts} value={jobId} onChange={setJobId} />}
    >
      <PageHeading
        title="Applicants"
        size="compact"
        subtitle={selectedJob ? selectedJob.title : "Across all your job posts."}
      />

      {!withRail && posts.length > 0 && (
        <div className="mb-3">
          <label htmlFor="applicants-job" className="sr-only">
            Job
          </label>
          <select
            id="applicants-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className={FIELD_CONTROL}
          >
            <option value="">All jobs</option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.applicants})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-4">
        <StatusTabs
          value={status}
          onChange={setStatus}
          labels={{ pending: "New", accepted: "Accepted", rejected: "Declined" }}
          counts={
            counts
              ? {
                  "": counts.all,
                  pending: counts.pending,
                  accepted: counts.accepted,
                  rejected: counts.rejected,
                }
              : undefined
          }
        />
      </div>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <ListError what="applicants" message={error} onRetry={reload} />
      ) : applicants.length === 0 ? (
        jobId || status ? (
          <EmptyState icon="userGroup" title="No applicants here">
            Nobody who applied {selectedJob ? "to this job " : ""}is in this state.
          </EmptyState>
        ) : (
          <EmptyState
            icon="userGroup"
            title="No applicants yet"
            action={
              <Link
                href="/dashboard/jobs/create"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-on-accent transition hover:bg-accent-hover"
              >
                <Icon name="plus" className="h-4 w-4" />
                Post a job
              </Link>
            }
          >
            When electricians apply to your jobs they appear here, with their
            classification, experience and résumé.
          </EmptyState>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-2">
            {applicants.map((applicant) => (
              <ApplicantCard
                key={applicant.id}
                applicant={applicant}
                isUpdating={updatingId === applicant.id}
                hasReviewed={reviewedIds.has(applicant.id)}
                onUpdateStatus={handleUpdate}
                onReviewed={refresh}
              />
            ))}
          </div>

          <LoadMore
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            endMessage="That's every applicant."
          />
        </>
      )}
    </RailColumns>
  );
}

/** The employer's jobs as a list to pick from, with applicant counts. */
function JobPicker({
  posts,
  value,
  onChange,
}: {
  posts: MyJobPost[];
  value: string;
  onChange: (id: string) => void;
}) {
  const total = posts.reduce((n, p) => n + p.applicants, 0);
  const rows = [
    { id: "", title: "All jobs", applicants: total, waiting: posts.reduce((n, p) => n + p.waiting, 0) },
    ...posts,
  ];

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">Your jobs</h2>
        <Link
          href="/dashboard/jobs/create"
          className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold text-accent-2-soft transition hover:text-white"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          Post
        </Link>
      </header>
      <ul className="p-1.5">
        {rows.map((row) => {
          const selected = row.id === value;
          return (
            <li key={row.id || "all"}>
              <button
                type="button"
                onClick={() => onChange(row.id)}
                aria-pressed={selected}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  selected ? "bg-zinc-800 text-white" : "text-gray-300 hover:bg-zinc-900"
                }`}
              >
                <span className={`min-w-0 flex-1 truncate ${selected ? "font-semibold" : ""}`}>
                  {row.title}
                </span>
                {row.waiting > 0 && (
                  <span className="shrink-0 rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">
                    {row.waiting}
                  </span>
                )}
                <span className="shrink-0 text-xs text-gray-500">{row.applicants}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
