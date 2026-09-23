"use client";

import { UnionBadge } from "@/components/ui/UnionBadge";
import { NameMeta } from "@/components/ui/NameMeta";
import type { PendingUnionWorker } from "@/hooks/useUnionVerifications";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export function UnionVerificationCard({
  worker,
  onApprove,
  onReject,
}: {
  worker: PendingUnionWorker;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const confirm = useConfirm();

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-white font-semibold">
          {worker.full_name || "Unnamed"}
          <NameMeta profileId={worker.id} signupType={worker.signup_type} />
        </h3>
        <div className="flex items-center gap-2 mt-1">
          {worker.trade && <span className="text-gray-400 text-sm">{worker.trade}</span>}
          <UnionBadge status={worker.union_status} verified={false} />
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Verify ${worker.full_name || "this worker"}'s union status?`,
              body: "Their union badge shows as confirmed to everyone on the platform.",
              confirmLabel: "Verify union status",
              tone: "primary",
            });
            if (ok) onApprove(worker.id);
          }}
          className="bg-accent text-on-accent px-4 min-h-11 rounded-lg font-semibold text-sm hover:bg-accent-hover transition"
        >
          Approve
        </button>
        <button
          onClick={async () => {
            // See useUnionVerifications: reject() is local only.
            const ok = await confirm({
              title: "Hide this request from the queue?",
              body: "Rejecting is not recorded yet — this only removes it from the list until the page reloads. The worker is not notified.",
              confirmLabel: "Hide request",
            });
            if (ok) onReject(worker.id);
          }}
          className="border border-zinc-700 text-white px-4 min-h-11 rounded-lg font-semibold text-sm hover:border-zinc-500 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
}