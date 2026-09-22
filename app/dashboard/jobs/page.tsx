"use client";

import { useState } from "react";
import { useJobs, type Job } from "@/hooks/useJobs";
import { LoadMore } from "@/components/ui/LoadMore";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithSponsoredRail } from "@/components/ads/PageWithSponsoredRail";
import { JobSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

export default function JobsPage() {
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
  } = useJobs();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  async function handleApply(jobId: string) {
    const { error } = await applyToJob(jobId);
    if (error) toast.error(error);
  }

  return (
    <div>
      {/* The heading and the rail render before the loading check, so the page
          does not change shape once the jobs arrive. */}
      <PageWithSponsoredRail
        placement="jobs_board"
        heading={<PageHeading title="Jobs Board" />}
      >
        {loading ? (
          <JobSkeleton />
        ) : jobs.length === 0 ? (
          <p className="text-gray-400">No jobs posted yet.</p>
        ) : (
          /* Two columns from 2xl. A job card is a title, pay, location and a
             couple of lines of description — at 1150px wide that is mostly
             empty card. Below 2xl the rail has already taken its 320 and one
             column is the right answer. */
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                hasApplied={appliedJobIds.has(job.id)}
                onViewDetails={setSelectedJob}
              />
            ))}
          </div>
        )}

        {/* Outside the grid so the sentinel is not laid out as a column. */}
        {!loading && jobs.length > 0 && (
          <LoadMore
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            endMessage="No more jobs right now."
          />
        )}
      </PageWithSponsoredRail>

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
