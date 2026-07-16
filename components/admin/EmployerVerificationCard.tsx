"use client";

import { useState } from "react";
import { getEmployerDocumentSignedUrl } from "@/lib/employerDocuments";
import { getBrandingPublicUrl } from "@/lib/branding";
import type { PendingEmployer } from "@/hooks/useEmployerVerifications";

export function EmployerVerificationCard({
  employer,
  onApprove,
  onReject,
}: {
  employer: PendingEmployer;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [opening, setOpening] = useState(false);

  async function handleViewDocument() {
    setOpening(true);
    const { error, url } = await getEmployerDocumentSignedUrl(employer.document_path);
    setOpening(false);

    if (error || !url) {
      alert(error || "Could not open document.");
      return;
    }

    window.open(url, "_blank");
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {employer.company_logo_path && (
          <img
            src={getBrandingPublicUrl(employer.company_logo_path)}
            alt="Company logo"
            className="w-12 h-12 rounded-full object-cover border border-zinc-700"
          />
        )}
        <div>
          <h3 className="text-white font-semibold">{employer.full_name || "Unnamed"}</h3>
          {employer.company_description && (
            <p className="text-gray-400 text-sm mt-1 max-w-md">{employer.company_description}</p>
          )}
          <button
            onClick={handleViewDocument}
            disabled={opening}
            className="text-yellow-400 hover:text-yellow-300 text-sm font-semibold mt-2 disabled:opacity-50"
          >
            {opening ? "Opening..." : `View Document (${employer.document_label}) →`}
          </button>
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onApprove(employer.id)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-green-500 transition"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(employer.id)}
          className="bg-zinc-800 text-gray-300 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-700 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
}