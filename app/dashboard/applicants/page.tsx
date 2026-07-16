"use client";

import { useApplicants } from "@/hooks/useApplicants";
import { ApplicantCard } from "@/components/applications/ApplicantCard";

export default function ApplicantsPage() {
  const { applicants, reviewedIds, loading, updatingId, updateStatus, refresh } = useApplicants();

  async function handleUpdate(id: string, status: "accepted" | "rejected" | "pending") {
    const { error } = await updateStatus(id, status);
    if (error) alert(error);
  }

  if (loading) {
    return <div className="text-white">Loading applicants...</div>;
  }

  return (
    <div>
      <h1 className="text-5xl font-bold mb-8">Applicants</h1>

      {applicants.length === 0 ? (
        <p className="text-gray-400">No applicants yet.</p>
      ) : (
        <div className="space-y-6">
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