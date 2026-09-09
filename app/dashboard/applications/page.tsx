"use client";

import { useApplications } from "@/hooks/useApplications";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import { PageHeading } from "@/components/layout/PageHeading";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function ApplicationsPage() {
  const { applications, reviewedIds, loading, refresh } = useApplications();

  if (loading) {
    return <CardSkeleton />;
  }

  return (
    <div>
      <PageHeading title="My Applications" />

      {applications.length === 0 ? (
        <p className="text-gray-400">No applications yet.</p>
      ) : (
        <div className="space-y-6">
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
    </div>
  );
}