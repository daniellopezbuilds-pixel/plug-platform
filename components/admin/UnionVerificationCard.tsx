"use client";

import { UnionBadge } from "@/components/ui/UnionBadge";
import type { PendingUnionWorker } from "@/hooks/useUnionVerifications";

export function UnionVerificationCard({
  worker,
  onApprove,
  onReject,
}: {
  worker: PendingUnionWorker;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex items-center justify-between gap-4">
      <div>
        <h3 className="text-white font-semibold">{worker.full_name || "Unnamed"}</h3>
        <div className="flex items-center gap-2 mt-1">
          {worker.trade && <span className="text-gray-400 text-sm">{worker.trade}</span>}
          <UnionBadge status={worker.union_status} verified={false} />
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onApprove(worker.id)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-green-500 transition"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(worker.id)}
          className="bg-zinc-800 text-gray-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-700 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
}