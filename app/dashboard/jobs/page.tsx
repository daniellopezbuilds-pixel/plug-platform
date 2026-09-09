"use client";

import { useState } from "react";
import { useJobs, type Job } from "@/hooks/useJobs";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithRail } from "@/components/layout/PageWithRail";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
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
      <PageHeading title="Jobs Board" />

      {/* The heading and the rail render before the loading check, so the page
          does not change shape once the jobs arrive. */}
      <PageWithRail rail={<SponsoredRail placement="jobs_board" />}>
        {loading ? (
          <JobSkeleton />
        ) : jobs.length === 0 ? (
          <p className="text-gray-400">No jobs posted yet.</p>
        ) : (
          <div className="space-y-6">
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
      </PageWithRail>

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
