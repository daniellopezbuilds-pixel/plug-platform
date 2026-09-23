"use client";

import { useState } from "react";
import type { GeneralRequest } from "@/hooks/useGeneralRequests";
import { useConfirm } from "@/components/ui/ConfirmDialog";

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
  const confirm = useConfirm();

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
      <h4 className="text-white font-semibold mb-1">{request.subject}</h4>
      <p className="text-gray-400 text-sm mb-4 whitespace-pre-wrap">{request.message}</p>

      <textarea
        placeholder="Admin notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-base mb-4 h-20 [color-scheme:dark] focus:border-accent focus:outline-none"
      />

      <div className="flex gap-3">
        <button
          onClick={async () => {
            const ok = await confirm({
              title: "Mark this request resolved?",
              body: "It leaves the queue and shows as Resolved to the person who sent it, with your notes.",
              confirmLabel: "Resolve request",
              tone: "primary",
            });
            if (ok) onResolve(request.id, notes);
          }}
          className="bg-accent text-on-accent px-5 min-h-11 rounded-lg font-semibold text-sm hover:bg-accent-hover transition"
        >
          Resolve
        </button>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: "Dismiss this request?",
              body: "It leaves the queue and shows as Dismissed to the person who sent it. It cannot be reopened from here.",
              confirmLabel: "Dismiss request",
            });
            if (ok) onDismiss(request.id, notes);
          }}
          className="border border-zinc-700 text-gray-300 px-5 min-h-11 rounded-lg font-semibold text-sm hover:border-zinc-500 hover:text-white transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}