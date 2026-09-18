"use client";

import { useState } from "react";
import { useSubmitGeneralConcern } from "@/hooks/useSubmitGeneralConcern";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useToast } from "@/components/ui/Toast";

export function SubmitGeneralConcern({ onSubmitted }: { onSubmitted?: () => void }) {
  const toast = useToast();
  const { submit, submitting } = useSubmitGeneralConcern();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required.");
      return;
    }

    const { error } = await submit({ subject, message });

    if (error) {
      toast.error(error);
      return;
    }

    setSubject("");
    setMessage("");

    toast.success("Your request has been submitted. An admin will review it shortly.");
    onSubmitted?.();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <h3 className="text-white font-semibold mb-4">Submit a General Concern</h3>

      <input
        type="text"
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-3"
      />

      <textarea
        placeholder="Describe your concern or request"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white h-32 mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-accent text-on-accent px-5 py-2.5 rounded font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <ButtonSpinner active={submitting} />
        {submitting ? "Submitting..." : "Submit Request"}
      </button>
    </div>
  );
}