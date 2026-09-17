"use client";

import { useApplicants } from "@/hooks/useApplicants";
import { ApplicantCard } from "@/components/applications/ApplicantCard";
import { PageHeading } from "@/components/layout/PageHeading";
import { CardSkeleton } from "@/components/ui/Skeleton";

export default function ApplicantsPage() {
  const { applicants, reviewedIds, loading, updatingId, updateStatus, refresh } = useApplicants();

  async function handleUpdate(id: string, status: "accepted" | "rejected" | "pending") {
    const { error } = await updateStatus(id, status);
    if (error) alert(error);
  }

  if (loading) {
    return <CardSkeleton />;
  }

  return (
    <div>
      <PageHeading title="Applicants" />

      {applicants.length === 0 ? (
        <p className="text-gray-400">No applicants yet.</p>
      ) : (
        /* Two columns from xl, matching /dashboard/applications — the two
           pages are the same shape seen from either side of a hire. */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {applicants.map((applicant) => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              isUpdating={updatingId === applicant.id}
              hasReviewed={reviewedIds.has(applicant.id)}
              onUpdateStatus={handleUpdate}
              onReviewed={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}