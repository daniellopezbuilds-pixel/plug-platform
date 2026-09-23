"use client";

import type { MyRequest } from "@/hooks/useMyRequests";
import { RailCard, RailSkeleton } from "@/components/layout/RailCard";
import { timeAgo } from "@/lib/relativeTime";

const typeLabels: Record<MyRequest["type"], string> = {
  employer_verification: "Employer verification",
  union_verification: "Union verification",
  ad_request: "Ad request",
  general_concern: "General concern",
};

/**
 * THEME COLOURS. Approved and resolved were raw green. A finished-in-your-
 * favour request is now the orange accent; rejected keeps rose, the palette's
 * one error colour, quietly (outline only); pending and dismissed are neutral.
 */
const statusStyles: Record<MyRequest["status"], string> = {
  pending: "border-zinc-700 text-gray-300",
  approved: "border-accent/60 bg-accent/10 text-accent",
  rejected: "border-rose-900 text-rose-400",
  resolved: "border-accent/60 bg-accent/10 text-accent",
  dismissed: "border-zinc-800 text-gray-500",
};

const statusLabels: Record<MyRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

/**
 * Your requests and where they stand.
 *
 * Beside the form rather than on a tab of its own: whether your last request
 * is still pending is exactly what you want to know while filing the next
 * one. The help-centre pattern (Stripe, Zendesk) — pick a type, fill it in,
 * with your history in view.
 */
export function MyRequestsList({
  requests,
  loading,
}: {
  requests: MyRequest[];
  loading: boolean;
}) {
  return (
    <RailCard title="Your requests">
      {loading ? (
        <RailSkeleton rows={3} />
      ) : requests.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">
          Nothing submitted yet. Requests you send appear here with their
          status.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {requests.map((request) => (
            <li key={`${request.type}-${request.id}`} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">{typeLabels[request.type]}</p>
                <p className="truncate text-sm font-semibold text-white">{request.title}</p>
                {request.created_at && (
                  <p className="text-xs text-gray-500">Sent {timeAgo(request.created_at)}</p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyles[request.status]}`}
              >
                {statusLabels[request.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}
