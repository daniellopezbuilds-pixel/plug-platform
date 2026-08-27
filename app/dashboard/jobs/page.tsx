"use client";

import { useState } from "react";
import { useJobs, type Job } from "@/hooks/useJobs";
import { usePublicAds } from "@/hooks/usePublicAds";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import { AdBanner } from "@/components/jobs/AdBanner";
import { FeedAdCard } from "@/components/ads/FeedAdCard";

const FEED_AD_INTERVAL = 5;

export default function JobsPage() {
  const { jobs, loading, appliedJobIds, applyingId, applyToJob } = useJobs();
  const { ads } = usePublicAds("jobs_board");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  async function handleApply(jobId: string) {
    const { error } = await applyToJob(jobId);
    if (error) alert(error);
  }

  if (loading) {
    return <div className="text-white">Loading jobs...</div>;
  }

  const topBannerAd = ads[0] || null;

  // Only show a bottom banner when there's a *different* ad to show.
  // With a single active ad, the bottom slot is hidden rather than repeated.
  const bottomBannerAd = ads.length > 1 ? ads[1] : null;

  return (
    <div>
      <h1 className="text-5xl font-bold text-white mb-8">Jobs Board</h1>

      {topBannerAd && <AdBanner ad={topBannerAd} />}

      {jobs.length === 0 ? (
        <p className="text-gray-400">No jobs posted yet.</p>
      ) : (
        <div className="space-y-6">
          {jobs.map((job, index) => {
            const showAdAfterThis =
              ads.length > 0 &&
              (index + 1) % FEED_AD_INTERVAL === 0 &&
              index !== jobs.length - 1;

            const feedAd = showAdAfterThis
              ? ads[Math.floor(index / FEED_AD_INTERVAL) % ads.length]
              : null;

            return (
              <div key={job.id}>
                <JobCard
                  job={job}
                  hasApplied={appliedJobIds.has(job.id)}
                  onViewDetails={setSelectedJob}
                />
                {feedAd && (
                  <div className="mt-6">
                    <FeedAdCard ad={feedAd} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bottomBannerAd && (
        <div className="mt-8">
          <AdBanner ad={bottomBannerAd} />
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