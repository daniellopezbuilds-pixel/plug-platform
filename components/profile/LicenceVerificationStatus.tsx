"use client";

import { useMyBadges, isCurrentlyVerified } from "@/hooks/useMyBadges";
import { cslbOwnerStatus } from "@/lib/cslb";
import { BadgeIcon } from "@/components/ui/BadgeIcon";

/**
 * Where the licence number stands, shown next to the licence number.
 *
 * WHY IT IS HERE AND NOT ONLY ON THE BADGES TAB. The badges screen answers
 * "what have I earned"; this answers "is the thing I just typed in any good",
 * and that question belongs beside the field. A contractor whose licence came
 * back `wrong_classification` is being told to change a value on THIS tab, and
 * routing them to another one to find that out is how the message gets missed.
 *
 * ONE SET OF STRINGS, NOT TWO. The sentence comes from cslbOwnerStatus() in
 * lib/cslb.tsx, the same function the badges section uses — a second copy
 * written for this tab is how the two start giving different advice about the
 * same reason code.
 *
 * Renders nothing for an account with no licence badge at all: an electrician
 * or an instructor has no C-10 and should not be shown an empty verification
 * panel implying they are missing something.
 */
export function LicenceVerificationStatus() {
  const { held, loading } = useMyBadges();

  if (loading) return null;

  const badge = held.find((b) => b.badge_key === "license_verified");
  if (!badge) return null;

  const status = cslbOwnerStatus(badge);
  if (!status) return null;

  const verified = isCurrentlyVerified(badge);

  // Same three tones the badges section uses, so a reason that reads as "we
  // are waiting" there does not read as "you must act" here.
  const tone =
    status.tone === "good"
      ? "border-accent/50 bg-accent/5"
      : status.tone === "action"
        ? "border-accent-2/50 bg-accent-2/10"
        : "border-zinc-700 bg-zinc-900/40";

  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${tone}`}>
      <span
        className={`shrink-0 mt-0.5 ${verified ? "text-accent" : "text-gray-500"}`}
      >
        <BadgeIcon icon="shield-check" className="w-5 h-5" />
      </span>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">
          {verified ? "Licence verified" : "Licence not verified"}
        </p>
        <p className="text-sm text-gray-300 mt-1">{status.text}</p>
      </div>
    </div>
  );
}
