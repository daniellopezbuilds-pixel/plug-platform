import { Card } from "@/components/ui/Card";
import type { IncomingRequest } from "@/hooks/useConnections";

export function ConnectionRequestCard({
  request,
  isActing,
  onRespond,
}: {
  request: IncomingRequest;
  isActing: boolean;
  onRespond: (connectionId: string, requesterId: string, status: "accepted" | "rejected") => void;
}) {
  const requester = request.requester;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">{requester?.full_name || "Unknown"}</h3>
          <p className="text-gray-400 text-sm">
            {requester?.profile_number} {requester?.trade ? `• ${requester.trade}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => requester && onRespond(request.id, requester.id, "accepted")}
            disabled={isActing}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            Accept
          </button>
          <button
            onClick={() => requester && onRespond(request.id, requester.id, "rejected")}
            disabled={isActing}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
          >
            Reject
          </button>
        </div>
      </div>
    </Card>
  );
}