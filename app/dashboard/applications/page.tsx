"use client";

import { useApplications } from "@/hooks/useApplications";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import { PageHeading } from "@/components/layout/PageHeading";
import { LoadMore } from "@/components/ui/LoadMore";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function ApplicationsPage() {
  const {
    applications,
    reviewedIds,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useApplications();

  if (loading) {
    return <CardSkeleton />;
  }

  return (
    <div>
      <PageHeading title="My Applications" />

      {applications.length === 0 ? (
        <p className="text-gray-400">No applications yet.</p>
      ) : (
        /* No rail on this page, so the full 1520 is available at 1920 — one
           column of application cards across all of it was the sparse case
           the widening was meant to fix. */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              hasReviewed={reviewedIds.has(application.id)}
              onReviewed={refresh}
            />
          ))}
        </div>
      )}

      {!loading && applications.length > 0 && (
        <LoadMore
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          endMessage="That's all your applications."
        />
      )}
    </div>
  );
}