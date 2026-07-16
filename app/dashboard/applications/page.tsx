"use client";

import { useApplications } from "@/hooks/useApplications";
import { ApplicationCard } from "@/components/applications/ApplicationCard";

export default function ApplicationsPage() {
  const { applications, reviewedIds, loading, refresh } = useApplications();

  if (loading) {
    return <div className="text-white">Loading applications...</div>;
  }

  return (
    <div>
      <h1 className="text-5xl font-bold mb-8">My Applications</h1>

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