"use client";

import { CSLB_STALE_AFTER_DAYS } from "@/lib/cslb";
import type { CslbImportInfo } from "@/hooks/useBadgeRequests";

/**
 * The "your CSLB data is old" warning above the review queue.
 *
 * WHY THIS IS WORTH A BANNER AND NOT A LOG LINE. Once the imported file passes
 * thirty days, cslb_evaluate_license() stops verifying anyone new and sends
 * every C-10 signup here instead, with the reason 'stale_data'. Nothing else
 * announces that. Without this, the first symptom is a review queue filling up
 * with requests an import would have cleared automatically, and no indication
 * that the fix is a download rather than thirty hand-checks.
 *
 * Existing badges are untouched by staleness and the copy says so, because the
 * obvious worry on reading "data is 40 days old" is that verified contractors
 * have quietly lost their check marks. They have not: expiry is derived from
 * each badge's own expires_at, which keeps working whatever the file's age.
 *
 * Renders nothing while the data is current. A banner that is always there is
 * furniture, and gets read as furniture on the day it matters.
 */
export function CslbStalenessBanner({ info }: { info: CslbImportInfo }) {
  const neverImported = info.ageDays === null;
  const stale = info.ageDays !== null && info.ageDays > CSLB_STALE_AFTER_DAYS;

  if (!neverImported && !stale) return null;

  return (
    <div className="border border-accent-2/50 bg-accent-2/10 rounded-lg p-4 mb-4">
      <p className="text-accent-2-soft font-semibold">
        {neverImported
          ? "No CSLB file has been imported."
          : `CSLB data is ${info.ageDays} days old — download and import the latest file.`}
      </p>

      <p className="text-gray-300 text-sm mt-1">
        {neverImported
          ? "Every C-10 signup is going straight to this queue because there is nothing to check licences against."
          : "Automatic verification is paused past 30 days, so new C-10 signups are arriving here instead of verifying themselves."}{" "}
        Badges that are already verified are unaffected — each one expires on
        its own licence date, whatever the age of the file.
      </p>

      <p className="text-gray-400 text-sm mt-2 font-mono">
        node --env-file=.env.local scripts/import-cslb.mjs --as-of &lt;file date&gt;
      </p>

      {info.sourceAsOf && (
        <p className="text-gray-400 text-xs mt-2">
          Current import: {info.rowCount?.toLocaleString()} C-10 licences, file
          dated {info.sourceAsOf}.
        </p>
      )}
    </div>
  );
}
