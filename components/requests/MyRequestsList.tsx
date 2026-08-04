"use client";

import type { MyRequest } from "@/hooks/useMyRequests";

const typeLabels: Record<MyRequest["type"], string> = {
  employer_verification: "Employer Verification",
  union_verification: "Union Verification",
  ad_request: "Ad Request",
  general_concern: "General Concern",
};

const statusStyles: Record<MyRequest["status"], string> = {
  pending: "bg-yellow-950 text-yellow-400 border-yellow-800",
  approved: "bg-green-950 text-green-400 border-green-800",
  rejected: "bg-red-950 text-red-400 border-red-800",
  resolved: "bg-green-950 text-green-400 border-green-800",
  dismissed: "bg-zinc-800 text-gray-400 border-zinc-700",
};

const statusLabels: Record<MyRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function MyRequestsList({
  requests,
  loading,
}: {
  requests: MyRequest[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-gray-400">Loading your requests...</p>;
  }

  if (requests.length === 0) {
    return <p className="text-gray-400">You haven't submitted any requests yet.</p>;
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div
          key={`${request.type}-${request.id}`}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {typeLabels[request.type]}
            </p>
            <h4 className="text-white font-semibold">{request.title}</h4>
            {request.created_at && (
              <p className="text-xs text-gray-500 mt-1">
                Submitted {new Date(request.created_at).toLocaleDateString()}
              </p>
            )}
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusStyles[request.status]}`}
          >
            {statusLabels[request.status]}
          </span>
        </div>
      ))}
    </div>
  );
}