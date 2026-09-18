"use client";

import { useState } from "react";
import Link from "next/link";
import {
  dismissCompletion,
  isCompletionDismissed,
  missingProfileFields,
  shouldPromptCompletion,
  type CompletionProfile,
} from "@/lib/profileCompletion";

/**
 * "Your profile is missing a few things" — once, on the dashboard, dismissible.
 *
 * NOT A NAG. It appears for an account that is missing a trade, a bio or a
 * photo, and the moment it is dismissed it is gone for that user for good. It
 * never returns because a field was emptied again, and it is not shown at all
 * to a profile that has all three.
 *
 * THE DISMISSAL IS READ ONCE, IN A useState INITIALISER, and that is load
 * bearing. Reading localStorage during render would be a hydration mismatch on
 * a prerendered page — server says "show", client says "dismissed" — and
 * reading it in an effect would flash the banner before hiding it. Neither
 * happens here because this component is only mounted after the dashboard's
 * profile fetch resolves, which is client-side and after hydration, so the
 * initialiser runs exactly once in a browser that definitely has a window.
 *
 * Two pieces of state, not one: `dismissed` is this page view, the stored flag
 * is every future one. They are separate so the banner still disappears on
 * click when localStorage throws (private mode) and the write is lost.
 */
export function ProfileCompletionBanner({
  userId,
  profile,
}: {
  userId: string;
  profile: CompletionProfile;
}) {
  const [dismissed, setDismissed] = useState(() =>
    isCompletionDismissed(userId)
  );

  if (dismissed || !shouldPromptCompletion(profile)) return null;

  const missing = missingProfileFields(profile);

  function handleDismiss() {
    dismissCompletion(userId);
    setDismissed(true);
  }

  return (
    <div
      // Not role="alert": nothing has gone wrong and nothing is urgent, so it
      // should not interrupt a screen reader mid-sentence. It is read in
      // document order like the rest of the page.
      className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">
          Your profile is missing {missing.length === 1 ? "one thing" : "a few things"}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          {/* The fields are named rather than counted. "Complete your profile"
              makes someone open the page to find out what it wants; naming them
              means they already know whether it is worth the trip. */}
          Add your {listFields(missing)} so other trades can see who you are.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/dashboard/profile"
          className="bg-accent text-on-accent px-4 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition text-sm min-h-11 inline-flex items-center"
        >
          Finish profile
        </Link>

        <button
          type="button"
          onClick={handleDismiss}
          // A worded button, not an ✕. This is the choice to never see it
          // again, and an icon would not say so.
          className="px-4 py-2.5 rounded-lg border border-zinc-700 text-gray-300 font-medium hover:text-white transition text-sm min-h-11"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** "a trade, a bio and a photo" — an Oxford-less list, lowercased. */
function listFields(labels: string[]): string {
  const lower = labels.map((label) => label.toLowerCase());

  if (lower.length === 1) return lower[0];
  if (lower.length === 2) return `${lower[0]} and ${lower[1]}`;

  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
}
