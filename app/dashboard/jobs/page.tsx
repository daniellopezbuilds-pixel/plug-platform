"use client";

import { useState } from "react";
import { useJobs, type Job } from "@/hooks/useJobs";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithSponsoredRail } from "@/components/ads/PageWithSponsoredRail";
import { JobSkeleton } from "@/components/ui/Skeleton";

export default function JobsPage() {
  const { jobs, loading, appliedJobIds, applyingId, applyToJob } = useJobs();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  async function handleApply(jobId: string) {
    const { error } = await applyToJob(jobId);
    if (error) alert(error);
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
