"use client";

import { useEffect, useState } from "react";
import {
  activeJobFilterCount,
  NO_JOB_FILTERS,
  useJobs,
  type JobFilters,
} from "@/hooks/useJobs";
import { usePublicAds } from "@/hooks/usePublicAds";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useDashboardProfile } from "@/components/layout/DashboardProfile";
import { EmployerJobsBoard } from "@/components/jobs/EmployerJobsBoard";
import { JobListItem } from "@/components/jobs/JobListItem";
import { JobDetailPanel } from "@/components/jobs/JobDetailPanel";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { PageHeading } from "@/components/layout/PageHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { FIELD_CONTROL } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { ListError } from "@/components/ui/ListError";
import { LoadMore } from "@/components/ui/LoadMore";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { JOB_CLASSIFICATIONS, WORK_TYPES } from "@/lib/jobs";

/**
 * The Jobs Board.
 *
 * WORKER MODE is a split view, the layout JobStreet and most job boards use:
 * a keyword search across the top with the filters beside it, a compact list
 * of jobs on the left, and the full job on the right with Apply pinned. The
 * first job is selected on arrival; clicking another swaps the panel without
 * leaving the list.
 *
 * EMPLOYER MODE keeps the card layout it had (components/jobs/
 * EmployerJobsBoard.tsx) — an employer is not browsing to apply.
 *
 * WHAT WAS BORROWED: the split view, the search-first header, compact list
 * rows, the applied marker in the list, and the pinned apply button. WHAT WAS
 * NOT: salary estimates, company review scores, applicant counts and
 * sponsored jobs mixed into the list — each implies data we do not hold, or
 * blurs an ad into the results. The sponsored slot stays a labelled banner
 * above the list, not a row in it.
 */
export default function JobsPage() {
  const profile = useDashboardProfile();
  if (profile?.active_role === "employer") return <EmployerJobsBoard />;
  return <WorkerJobsBoard />;
}

/** How long typing pauses before the keyword is searched. */
const SEARCH_DEBOUNCE_MS = 300;

function WorkerJobsBoard() {
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
    error,
    reload,
  } = useJobs();
  const { ad, adIndex, adCount, selectAd, loading: adLoading } = usePublicAds("jobs_board");

  // Split from 1280. Below that the list and the job cannot both be read
  // side by side, so the list is full width and a job opens over it.
  const split = useMediaQuery("(min-width: 1280px)");

  /**
   * ?job=<id> preselects a job — the dashboard and feed rails link here with
   * it. Read in the initialiser: this component renders a skeleton until the
   * jobs arrive, so the server and first client render agree whatever it is.
   */
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("job")
  );

  // The keyword box is local and debounced into the filters, so the list
  // refetches when typing pauses rather than on every keystroke.
  const [query, setQuery] = useState(filters.q);
  useEffect(() => {
    if (query === filters.q) return;
    const t = setTimeout(() => setFilters({ ...filters, q: query }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, filters, setFilters]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = activeJobFilterCount(filters);

  /**
   * The job on screen. On a split screen it falls back to the first in the
   * list, so there is never an empty panel — including after a filter removes
   * the one that was selected. On a phone nothing is open until a job is
   * tapped.
   */
  const selectedJob =
    jobs.find((j) => j.id === selectedId) ?? (split ? jobs[0] ?? null : null);

  async function handleApply(jobId: string) {
    const { error: applyError } = await applyToJob(jobId);
    if (applyError) {
      toast.error(applyError);
      return;
    }
    toast.success("Application sent. The employer has been notified.");
  }

  function clearAll() {
    setQuery("");
    setFilters(NO_JOB_FILTERS);
  }

  /** Arrow keys move through the list, as in any mail or job list. */
  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (jobs.length === 0) return;
    e.preventDefault();
    const at = selectedJob ? jobs.findIndex((j) => j.id === selectedJob.id) : -1;
    const next = jobs[Math.min(jobs.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    setSelectedId(next.id);
    document.querySelector<HTMLElement>(`[data-job-id="${next.id}"]`)?.focus();
  }

  const nothing = !loading && !error && jobs.length === 0;
  const showSplit = split && !nothing && !error;

  return (
    <div>
      <PageHeading title="Jobs Board" size="compact" />

      {/* SEARCH, full width, filters beside it. */}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search jobs</span>
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search job title, company or keyword"
            className={`${FIELD_CONTROL} pl-11`}
          />
        </label>

        <div className="hidden gap-2 lg:flex">
          <FilterSelects filters={filters} onChange={setFilters} idPrefix="jobs-bar" />
        </div>

        <div className="flex gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${
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
        </div>

        {(activeFilters > 0 || filters.q) && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:text-white"
          >
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:hidden">
          <FilterSelects filters={filters} onChange={setFilters} idPrefix="jobs-panel" />
        </div>
      )}

      <div
        className={
          showSplit ? "grid grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-start gap-6" : ""
        }
      >
        {/* LIST */}
        <div className="min-w-0">
          {/* The sponsored slot is a labelled banner above the list, never a
              row inside it. */}
          <div className="mb-3 empty:hidden">
            <SponsoredRail ad={ad} index={adIndex} total={adCount} onSelect={selectAd} loading={adLoading} />
          </div>

          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ListError what="jobs" message={error} onRetry={reload} />
          ) : jobs.length === 0 ? (
            activeFilters > 0 || filters.q ? (
              <EmptyState
                icon="search"
                title="No jobs match your search"
                action={
                  <button
                    type="button"
                    onClick={clearAll}
                    className="min-h-11 rounded-lg border border-zinc-700 px-5 font-semibold text-white transition hover:border-zinc-500"
                  >
                    Clear search and filters
                  </button>
                }
              >
                Try fewer words, or a different classification or work type.
              </EmptyState>
            ) : (
              <EmptyState icon="briefcase" title="No open jobs right now">
                New postings from contractors appear here as soon as they are
                published. Check back soon.
              </EmptyState>
            )
          ) : (
            <>
              <ul className="space-y-2" aria-label="Jobs" onKeyDown={onListKeyDown}>
                {jobs.map((job) => (
                  <li key={job.id}>
                    <JobListItem
                      job={job}
                      selected={selectedJob?.id === job.id}
                      hasApplied={appliedJobIds.has(job.id)}
                      onSelect={setSelectedId}
                    />
                  </li>
                ))}
              </ul>

              <LoadMore
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                endMessage={
                  activeFilters > 0 || filters.q ? "No more matching jobs." : "No more jobs right now."
                }
              />
            </>
          )}
        </div>

        {/* DETAIL — beside the list from 1280 */}
        {showSplit && (
          <aside
            aria-label="Job details"
            className="sticky top-6 h-[calc(100dvh-3rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
          >
            {selectedJob ? (
              <JobDetailPanel
                job={selectedJob}
                hasApplied={appliedJobIds.has(selectedJob.id)}
                isApplying={applyingId === selectedJob.id}
                onApply={handleApply}
              />
            ) : (
              <div className="space-y-3 p-6" aria-hidden="true">
                <SkeletonBlock className="h-4 w-40" />
                <SkeletonBlock className="h-7 w-2/3" />
                <SkeletonBlock className="h-5 w-24" />
              </div>
            )}
          </aside>
        )}
      </div>

      {/* DETAIL — full screen below 1280, with a back button and Apply fixed
          at the bottom. */}
      {!split && selectedJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedJob.title}
          className="fixed inset-0 z-50 bg-zinc-950"
        >
          <JobDetailPanel
            job={selectedJob}
            hasApplied={appliedJobIds.has(selectedJob.id)}
            isApplying={applyingId === selectedJob.id}
            onApply={handleApply}
            onBack={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Classification, work type and union status as three labelled selects. */
function FilterSelects({
  filters,
  onChange,
  idPrefix,
}: {
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
  idPrefix: string;
}) {
  const select = `${FIELD_CONTROL} lg:w-48`;
  return (
    <>
      <label htmlFor={`${idPrefix}-classification`} className="sr-only">
        Classification
      </label>
      <select
        id={`${idPrefix}-classification`}
        value={filters.classification}
        onChange={(e) => onChange({ ...filters, classification: e.target.value })}
        className={select}
      >
        <option value="">Any classification</option>
        {JOB_CLASSIFICATIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label htmlFor={`${idPrefix}-work-type`} className="sr-only">
        Work type
      </label>
      <select
        id={`${idPrefix}-work-type`}
        value={filters.workType}
        onChange={(e) => onChange({ ...filters, workType: e.target.value })}
        className={select}
      >
        <option value="">Any work type</option>
        {WORK_TYPES.map((w) => (
          <option key={w.key} value={w.key}>
            {w.label}
          </option>
        ))}
      </select>

      <label htmlFor={`${idPrefix}-union`} className="sr-only">
        Union status
      </label>
      <select
        id={`${idPrefix}-union`}
        value={filters.union}
        onChange={(e) => onChange({ ...filters, union: e.target.value as JobFilters["union"] })}
        className={select}
      >
        <option value="">Any union status</option>
        <option value="union">Union</option>
        <option value="non_union">Non-union</option>
        <option value="open">No union requirement</option>
      </select>
    </>
  );
}

/** Compact rows, matching JobListItem's shape so nothing jumps on load. */
function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
          <SkeletonBlock className="mb-2 h-4 w-3/4" />
          <SkeletonBlock className="mb-2 h-3 w-1/2" />
          <SkeletonBlock className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
