"use client";

import { useState } from "react";
import {
  activeJobFilterCount,
  NO_JOB_FILTERS,
  useJobs,
  type Job,
} from "@/hooks/useJobs";
import { usePublicAds } from "@/hooks/usePublicAds";
import { useMyApplicationCounts } from "@/hooks/useMyApplicationCounts";
import { LoadMore } from "@/components/ui/LoadMore";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { JobFiltersPanel } from "@/components/jobs/JobFilters";
import { ApplicationsSummaryCard } from "@/components/jobs/ApplicationsSummaryCard";
import { ProfileSummaryCard } from "@/components/feed/FeedRail";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { JobSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";

/**
 * The Jobs Board as EMPLOYER mode sees it — the card-grid layout, kept as it
 * was when the worker view became a split view (see app/dashboard/jobs/page.tsx).
 *
 * WHAT THE RAILS HOLD. The rail used to be the sponsored slot alone, and on a
 * placement with nothing live it collapsed and the board became one column of
 * wide, mostly-empty cards. It now carries the filters — the thing a board
 * this size most lacked — plus where your own applications stand and your
 * profile, which is what an employer sees when you apply.
 *
 *   under 1280    one column: heading, sponsored slot, a Filters toggle, jobs
 *   1280-1719     jobs | sponsored, filters, applications, profile
 *   1720 and up   filters | jobs | sponsored, applications, profile
 *
 * Rails are sticky and scroll on their own; see RailColumns.
 *
 * CARDS GO TWO-UP BY THE COLUMN'S WIDTH, not the window's (`@3xl`, a container
 * query on the main column). How wide the jobs column is depends on how many
 * rails there are, so a viewport breakpoint would put two cards in 600px at
 * one width and one card in 1100px at another.
 */
export function EmployerJobsBoard() {
  const toast = useToast();
  const {
    jobs,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    appliedJobIds,
    applyingId,
    applyToJob,
    filters,
    setFilters,
  } = useJobs();
  const { ad, adIndex, adCount, selectAd, loading: adLoading } = usePublicAds("jobs_board");
  const { withRail, split } = useRailBreakpoints();

  // Recounted whenever the set of applied jobs changes, so the card agrees
  // with the button that just turned into "Applied".
  const applicationCounts = useMyApplicationCounts(appliedJobIds.size);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilters = activeJobFilterCount(filters);

  async function handleApply(jobId: string) {
    const { error } = await applyToJob(jobId);
    if (error) toast.error(error);
  }

  const sponsored = (
    <SponsoredRail
      ad={ad}
      index={adIndex}
      total={adCount}
      onSelect={selectAd}
      loading={adLoading}
    />
  );

  const filterPanel = (idPrefix: string) => (
    <JobFiltersPanel filters={filters} onChange={setFilters} idPrefix={idPrefix} />
  );

  return (
    <div>
      <RailColumns
        withRail={withRail}
        split={split}
        leftLabel="Filters"
        left={filterPanel("jobs-filter-left")}
        rightLabel="Sponsored and your activity"
        right={
          <>
            {sponsored}
            {!split && filterPanel("jobs-filter-right")}
            <ApplicationsSummaryCard counts={applicationCounts} />
            <ProfileSummaryCard />
          </>
        }
      >
        <PageHeading
          title="Jobs Board"
          size="compact"
          subtitle="Open electrical work posted by contractors."
        />

        {!withRail && (
          <>
            <div className="mb-4 empty:hidden">{sponsored}</div>

            {/* Filters on a phone: a toggle, not the panel itself, which
                would push the first job below the fold. */}
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${
                  activeFilters > 0 || filtersOpen
                    ? "border-accent text-white"
                    : "border-zinc-700 text-gray-300 hover:border-zinc-500"
                }`}
              >
                Filters
                {activeFilters > 0 && (
                  <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">
                    {activeFilters}
                  </span>
                )}
                <Icon
                  name="chevronDown"
                  className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                />
              </button>
              {activeFilters > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters(NO_JOB_FILTERS)}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {filtersOpen && <div className="mb-4">{filterPanel("jobs-filter-top")}</div>}
          </>
        )}

        {loading ? (
          <JobSkeleton />
        ) : jobs.length === 0 ? (
          activeFilters > 0 ? (
            <EmptyState
              icon="briefcase"
              title="No jobs match these filters"
              action={
                <button
                  type="button"
                  onClick={() => setFilters(NO_JOB_FILTERS)}
                  className="min-h-11 rounded-lg border border-zinc-700 px-5 font-semibold text-white transition hover:border-zinc-500"
                >
                  Clear filters
                </button>
              }
            >
              Try a different classification or work type, or clear the filters
              to see every open job.
            </EmptyState>
          ) : (
            <EmptyState icon="briefcase" title="No open jobs right now">
              New postings from contractors appear here as soon as they are
              published. Check back soon.
            </EmptyState>
          )
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  hasApplied={appliedJobIds.has(job.id)}
                  onViewDetails={setSelectedJob}
                />
              ))}
            </div>

            {/* Outside the grid so the sentinel is not laid out as a column. */}
            <LoadMore
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              endMessage={activeFilters > 0 ? "No more matching jobs." : "No more jobs right now."}
            />
          </>
        )}
      </RailColumns>

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          hasApplied={appliedJobIds.has(selectedJob.id)}
          isApplying={applyingId === selectedJob.id}
          onApply={handleApply}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}
