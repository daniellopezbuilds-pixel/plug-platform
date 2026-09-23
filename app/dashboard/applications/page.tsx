"use client";

import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { useMyApplicationCounts } from "@/hooks/useMyApplicationCounts";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import { StatusTabs } from "@/components/applications/StatusTabs";
import { MatchingJobsCard } from "@/components/dashboard/DashboardLists";
import { ProfileSummaryCard } from "@/components/feed/FeedRail";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListError } from "@/components/ui/ListError";
import { LoadMore } from "@/components/ui/LoadMore";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useMarkNotificationsRead } from "@/hooks/useMarkNotificationsRead";

const STATUS_CHANGE_TYPES = ["status_change"] as const;

/**
 * My Applications.
 *
 * STATUS FIRST. Tabs with counts — All, Waiting, Accepted, Declined —
 * filtered in the query so paging keeps working inside a tab. Accepted is the
 * one that asks you to act, and it used to be one small pill among a wall of
 * two-column cards.
 *
 * THE RAIL: jobs asking for your classification (the obvious next thing to
 * apply to) and your profile (what every employer you applied to is looking
 * at).
 */
export default function ApplicationsPage() {
  const {
    applications,
    reviewedIds,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    status,
    setStatus,
    error,
    reload,
  } = useApplications();
  const counts = useMyApplicationCounts();
  // Opening this page reads the decision notifications, so the sidebar badge
  // stops counting decisions you are already looking at.
  useMarkNotificationsRead(STATUS_CHANGE_TYPES);
  const { withRail } = useRailBreakpoints();

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      rightLabel="Jobs and your profile"
      right={
        <>
          <MatchingJobsCard />
          <ProfileSummaryCard />
        </>
      }
    >
      <PageHeading title="My Applications" size="compact" />

      <div className="mb-4">
        <StatusTabs
          value={status}
          onChange={setStatus}
          counts={
            counts
              ? {
                  "": counts.total,
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
        <ListError what="your applications" message={error} onRetry={reload} />
      ) : applications.length === 0 ? (
        status ? (
          <EmptyState icon="briefcase" title="Nothing here">
            None of your applications are in this state.
          </EmptyState>
        ) : (
          <EmptyState
            icon="briefcase"
            title="No applications yet"
            action={
              <Link
                href="/dashboard/jobs"
                className="inline-flex min-h-11 items-center rounded-lg bg-accent px-5 font-semibold text-on-accent transition hover:bg-accent-hover"
              >
                Browse jobs
              </Link>
            }
          >
            When you apply to a job it shows up here, along with the
            employer&apos;s decision.
          </EmptyState>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @4xl:grid-cols-2">
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                hasReviewed={reviewedIds.has(application.id)}
                onReviewed={refresh}
              />
            ))}
          </div>

          <LoadMore
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            endMessage="That's all your applications."
          />
        </>
      )}

      {!withRail && (
        <div className="mt-6">
          <MatchingJobsCard />
        </div>
      )}
    </RailColumns>
  );
}
