"use client";

import { useState } from "react";
import type { EligibleContact } from "@/hooks/useEligibleContacts";

export function NewConversationPanel({
  contacts,
  onStart,
  onClose,
}: {
  contacts: EligibleContact[];
  onStart: (participantIds: string[], title?: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStart() {
    if (selected.size === 0) return;
    onStart(Array.from(selected), selected.size > 1 ? title : undefined);
  }

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-white mb-4">New Message</h2>

        {contacts.length === 0 ? (
          <p className="text-gray-400 text-sm mb-4">
            You can only message people you're connected with, or employers/applicants tied to a job.
          </p>
        ) : (
          <>
            <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
              {contacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800 cursor-pointer hover:bg-zinc-700 transition"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(contact.id)}
                    onChange={() => toggle(contact.id)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="text-white font-semibold">{contact.full_name || "Unknown"}</p>
                    <p className="text-gray-400 text-xs">
                      {contact.profile_number} {contact.trade ? `• ${contact.trade}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {selected.size > 1 && (
              <input
                type="text"
                placeholder="Group name (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 mb-4 rounded-lg bg-zinc-800 border border-zinc-700 text-white"
              />
            )}
          </>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={selected.size === 0}
            className="flex-1 bg-white text-black px-5 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            Start Conversation
          </button>
          <button
            onClick={onClose}
            className="bg-zinc-800 text-gray-300 px-5 py-3 rounded-lg font-semibold hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}