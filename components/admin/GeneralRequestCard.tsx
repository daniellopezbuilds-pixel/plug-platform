"use client";

import { useState } from "react";
import type { GeneralRequest } from "@/hooks/useGeneralRequests";

export function GeneralRequestCard({
  request,
  onResolve,
  onDismiss,
}: {
  request: GeneralRequest;
  onResolve: (id: string, adminNotes?: string) => void;
  onDismiss: (id: string, adminNotes?: string) => void;
}) {
  const [notes, setNotes] = useState("");

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <h4 className="text-white font-semibold mb-1">{request.subject}</h4>
      <p className="text-gray-400 text-sm mb-4 whitespace-pre-wrap">{request.message}</p>

      <textarea
        placeholder="Admin notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white text-sm mb-4 h-20"
      />

      <div className="flex gap-3">
        <button
          onClick={() => onResolve(request.id, notes)}
          className="bg-green-950 text-green-400 border border-green-800 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-green-900 transition"
        >
          Resolve
        </button>
        <button
          onClick={() => onDismiss(request.id, notes)}
          className="bg-zinc-800 text-gray-300 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-zinc-700 transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}