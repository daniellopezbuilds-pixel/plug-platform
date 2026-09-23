"use client";

import { useState } from "react";
import { useSubmitGeneralConcern } from "@/hooks/useSubmitGeneralConcern";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { FIELD_CONTROL, Field, FormSection } from "@/components/ui/Form";
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
    <FormSection
      title="General concern"
      description="Report a problem, flag a listing, or ask the admin team anything else."
    >
      <Field label="Subject" htmlFor="concern-subject">
        <input
          id="concern-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={FIELD_CONTROL}
        />
      </Field>

      <Field label="Details" htmlFor="concern-message">
        <textarea
          id="concern-message"
          placeholder="What happened, and anything that would help us look into it"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className={`${FIELD_CONTROL} min-h-36 resize-y leading-relaxed`}
        />
      </Field>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50 sm:w-auto"
        >
          <ButtonSpinner active={submitting} />
          {submitting ? "Submitting..." : "Submit request"}
        </button>
      </div>
    </FormSection>
  );
}
