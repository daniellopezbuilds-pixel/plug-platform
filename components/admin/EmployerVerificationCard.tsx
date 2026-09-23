"use client";

import { useState } from "react";
import { getEmployerDocumentSignedUrl } from "@/lib/employerDocuments";
import { getBrandingPublicUrl } from "@/lib/branding";
import type { PendingEmployer } from "@/hooks/useEmployerVerifications";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { NameMeta } from "@/components/ui/NameMeta";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export function EmployerVerificationCard({
  employer,
  onApprove,
  onReject,
}: {
  employer: PendingEmployer;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [opening, setOpening] = useState(false);

  async function handleViewDocument() {
    setOpening(true);
    const { error, url } = await getEmployerDocumentSignedUrl(employer.document_path);
    setOpening(false);

    if (error || !url) {
      toast.error(error || "Could not open document.");
      return;
    }

    window.open(url, "_blank");
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {employer.company_logo_path && (
          <img
            src={getBrandingPublicUrl(employer.company_logo_path)}
            alt="Company logo"
            className="w-12 h-12 rounded-full object-cover border border-zinc-700"
          />
        )}
        <div>
          <h3 className="text-white font-semibold">
            {employer.full_name || "Unnamed"}
            <NameMeta profileId={employer.id} signupType={employer.signup_type} />
          </h3>
          {employer.company_description && (
            <p className="text-gray-400 text-sm mt-1 max-w-md">{employer.company_description}</p>
          )}
          <button
            onClick={handleViewDocument}
            disabled={opening}
            className="text-accent-2-soft hover:text-white text-sm font-semibold mt-2 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <ButtonSpinner active={opening} />
            {opening
              ? "Opening..."
              : employer.document_label
                ? `View Document (${employer.document_label}) →`
                : "View Document →"}
          </button>
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Verify ${employer.full_name || "this employer"}?`,
              body: "Their profile shows as a verified employer to everyone on the platform.",
              confirmLabel: "Verify employer",
              tone: "primary",
            });
            if (ok) onApprove(employer.id);
          }}
          className="bg-accent text-on-accent px-4 min-h-11 rounded-lg font-semibold text-sm hover:bg-accent-hover transition"
        >
          Approve
        </button>
        <button
          onClick={async () => {
            // Honest about what this does today: useEmployerVerifications
            // reject() only removes the card locally. Nothing is written, so
            // the request returns on the next load.
            const ok = await confirm({
              title: "Hide this request from the queue?",
              body: "Rejecting is not recorded yet — this only removes it from the list until the page reloads. The employer is not notified.",
              confirmLabel: "Hide request",
            });
            if (ok) onReject(employer.id);
          }}
          className="border border-zinc-700 text-white px-4 min-h-11 rounded-lg font-semibold text-sm hover:border-zinc-500 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
}