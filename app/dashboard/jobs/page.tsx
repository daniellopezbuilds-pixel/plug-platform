"use client";

import { useState } from "react";
import { useJobs, type Job } from "@/hooks/useJobs";
import { useActiveAd } from "@/hooks/useActiveAd";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { AdBanner } from "@/components/jobs/AdBanner";

export default function JobsPage() {
  const { jobs, loading, appliedJobIds, applyingId, applyToJob } = useJobs();
  const { ad } = useActiveAd("jobs_board");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  async function handleApply(jobId: string) {
    const { error } = await applyToJob(jobId);
    if (error) alert(error);
  }

  if (loading) {
    return <div className="text-white">Loading jobs...</div>;
  }

  return (
    <div>
      <h1 className="text-5xl font-bold text-white mb-8">Jobs Board</h1>

      {ad && <AdBanner ad={ad} />}

      {jobs.length === 0 ? (
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