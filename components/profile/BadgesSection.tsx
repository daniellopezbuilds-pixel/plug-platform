"use client";

import {
  useMyBadges,
  isCurrentlyVerified,
  type HeldBadge,
} from "@/hooks/useMyBadges";
import { InlineLoader } from "@/components/ui/Loading";

/**
 * The badges section on /dashboard/profile.
 *
 * Lists every badge currently on offer, held or not, with what a locked one
 * needs. Held badges that have expired or been rejected are shown as such
 * rather than hidden — this is the only screen where a user can find out why a
 * request did not go through.
 *
 * NO REQUEST BUTTON YET. The request form and the admin review tab are phase 3
 * and are not built; both review badges ship inactive, so nothing here is
 * requestable today and the copy does not pretend otherwise. When they are
 * switched on, the button belongs on the locked rows below.
 */

function statusNote(badge: HeldBadge) {
  if (isCurrentlyVerified(badge)) {
    if (badge.expires_at) {
      return `Verified — expires ${new Date(badge.expires_at).toLocaleDateString()}`;
    }
    return "Verified";
  }

  if (badge.status === "verified" && badge.expires_at) {
    return `Expired ${new Date(badge.expires_at).toLocaleDateString()}`;
  }

  if (badge.status === "pending") return "Awaiting review";
  if (badge.status === "rejected") return "Not approved";
  if (badge.status === "revoked") return "Revoked";

  return null;
}

export function BadgesSection() {
  const { catalog, held, loading } = useMyBadges();

  if (loading) {
    return <InlineLoader message="Loading badges" />;
  }

  // Nothing on offer at all. Rather than an empty heading, say nothing —
  // which is the state while both verification badges are switched off and the
  // account is not in the first hundred.
  if (catalog.length === 0) return null;

  const heldByKey = new Map(held.map((b) => [b.badge_key, b]));

  return (
    <div className="border-t border-zinc-800 pt-6 mt-2">
      <h2 className="text-xl font-bold text-white mb-1">Badges</h2>
      <p className="text-xs text-gray-400 mb-4">
        Shown beside your name across the platform.
      </p>

      <div className="space-y-3">
        {catalog.map((badge) => {
          const mine = heldByKey.get(badge.key);
          const earned = mine ? isCurrentlyVerified(mine) : false;
          const note = mine ? statusNote(mine) : null;

          return (
            <div
              key={badge.key}
              className={`border rounded-lg p-4 ${
                earned
                  ? "border-zinc-700 bg-zinc-900"
                  : "border-zinc-800 bg-transparent"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold ${
                    earned ? "text-white" : "text-gray-400"
                  }`}
                >
                  {badge.label}
                </span>
                {earned && (
                  <span className="text-accent text-sm font-bold">✓</span>
                )}
                {note && (
                  <span className="text-xs text-gray-400 font-normal">
                    {note}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 mt-1">{badge.description}</p>

              {/* The reason is the whole point of storing it — a rejection the
                  user cannot read is what the rejected status exists to
                  prevent. */}
              {mine?.status === "rejected" && mine.rejection_reason && (
                <p className="text-sm text-gray-300 mt-2 border-l-2 border-zinc-700 pl-3">
                  {mine.rejection_reason}
                </p>
              )}

              {!mine && badge.requires_review && (
                <p className="text-xs text-gray-500 mt-2">
                  Requests are not open yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
