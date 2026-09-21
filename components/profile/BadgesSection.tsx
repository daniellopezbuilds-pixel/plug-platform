"use client";

import {
  useMyBadges,
  isCurrentlyVerified,
  type BadgeCatalogEntry,
  type HeldBadge,
} from "@/hooks/useMyBadges";
import { BadgeIcon } from "@/components/ui/BadgeIcon";
import { cslbOwnerStatus } from "@/lib/cslb";
import { InlineLoader } from "@/components/ui/Loading";

/**
 * The badges section on /dashboard/profile.
 *
 * Lists every badge currently on offer, held or not. Held badges that have
 * expired or been rejected are shown as such rather than hidden — this is the
 * only screen where a user can find out why a request did not go through.
 *
 * A ROW, NOT A CARD. Circular icon, name, one line of description. No border,
 * no panel, no gradient: a list of achievements that each sit in their own box
 * reads as a settings screen, and the colour of the icon is doing the work of
 * saying which are earned.
 *
 * NO REQUEST BUTTON, AND license_verified NO LONGER NEEDS ONE. That badge is
 * awarded from the licence number already on the account -- the CSLB import
 * checks it and a trigger writes the badge, so there is nothing for a user to
 * submit. See 20260921120000_cslb_license_verification.sql.
 *
 * business_verified is still inactive and still has no request flow, so the
 * locked copy below stays deliberately neutral about how a badge is obtained.
 * When that one is switched on, a button belongs on its row -- not on
 * license_verified's.
 */

/**
 * The line that sits beside the name. Earned badges get a tick; everything else
 * says what is standing between the user and the badge, which is the whole
 * point of showing a locked one at all.
 */
function lockedNote(badge: BadgeCatalogEntry, mine: HeldBadge | undefined) {
  if (!mine) {
    // Deliberately says nothing about HOW the badge is obtained. It used to
    // read "Requests are not open yet", which stopped being true for
    // license_verified the day the CSLB check went live -- that badge is
    // awarded automatically and was never going to be requested. One neutral
    // sentence is correct for both review badges rather than right for one.
    return badge.requires_review ? "Not yet verified" : "Not awarded";
  }

  if (mine.status === "pending") return "Awaiting review";
  if (mine.status === "rejected") return "Not approved";
  if (mine.status === "revoked") return "Revoked";

  // status is 'verified' but isCurrentlyVerified said no, which leaves exactly
  // one cause: the expiry date has passed. There is no stored 'expired' status
  // — see section 4 of 20260916130000_badges.sql.
  if (mine.expires_at) {
    return `Expired ${new Date(mine.expires_at).toLocaleDateString()}`;
  }

  return "Not awarded";
}

export function BadgesSection() {
  const { catalog, held, loading } = useMyBadges();

  if (loading) {
    return <InlineLoader message="Loading badges" />;
  }

  // Nothing on offer at all — say nothing rather than show an empty heading.
  // That is the state while both verification badges are switched off and the
  // account is not in the first hundred.
  if (catalog.length === 0) return null;

  const heldByKey = new Map(held.map((b) => [b.badge_key, b]));

  return (
    // A bordered panel rather than a bare section with a top rule: this sits in
    // the profile's right rail from xl and stacks under the form below it, and
    // a panel reads correctly in both places where a `border-t` only read
    // correctly in the flow.
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="text-xl font-bold text-white mb-1">Badges</h2>
      <p className="text-xs text-gray-400 mb-5">
        Shown beside your name across the platform.
      </p>

      <div className="space-y-5">
        {catalog.map((badge) => {
          const mine = heldByKey.get(badge.key);
          const earned = mine ? isCurrentlyVerified(mine) : false;
          const status =
            badge.key === "license_verified" && mine
              ? cslbOwnerStatus(mine)
              : null;

          return (
            <div key={badge.key} className="flex items-start gap-3">
              <span
                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  earned
                    ? "bg-accent text-on-accent"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                <BadgeIcon icon={badge.icon} />
              </span>

              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-semibold ${
                      earned ? "text-white" : "text-gray-400"
                    }`}
                  >
                    {badge.label}
                  </span>

                  {earned ? (
                    <span
                      className="text-accent text-sm font-bold"
                      aria-label="Verified"
                      role="img"
                    >
                      ✓
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {lockedNote(badge, mine)}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-400 mt-0.5">
                  {badge.description}
                </p>

                {/* The reason is the whole point of storing it — a rejection
                    the user cannot read is what the rejected status exists to
                    prevent. */}
                {mine?.status === "rejected" && mine.rejection_reason && (
                  <p className="text-sm text-gray-300 mt-2 border-l-2 border-zinc-700 pl-3">
                    {mine.rejection_reason}
                  </p>
                )}

                {/* Licence verification explains itself. The other two badges
                    have nothing to explain: early_member is awarded or not, and
                    business_verified has no automated check behind it. */}
                {badge.key === "license_verified" && mine && status && (
                  <p
                    className={`text-sm mt-2 border-l-2 pl-3 ${
                      status.tone === "good"
                        ? "border-accent text-gray-300"
                        : status.tone === "action"
                          ? "border-amber-600 text-gray-300"
                          : "border-zinc-700 text-gray-400"
                    }`}
                  >
                    {status.text}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
