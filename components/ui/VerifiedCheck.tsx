import { BadgeIcon } from "./BadgeIcon";

/**
 * The single verification marker beside a name.
 *
 * ONE MARK, NOT A ROW OF ICONS. An account holding three verification badges
 * still gets one glyph here. Which badges, and what each one required, belong
 * on the profile's badges section — not inline next to every mention of
 * someone's name. useProfileBadges picks which badge the marker represents
 * when there is more than one; see MARKER_PRIORITY there.
 *
 * IT MEANS VERIFIED, NOT DECORATED. The marker lights only for badges in the
 * 'verification' category. early_member is a community badge and deliberately
 * does not light it up: a mark next to a name reads as "we checked who this
 * is", and awarding it for signing up early would make that a lie on every one
 * of the first hundred accounts.
 *
 * THE GLYPH IS THE BADGE'S OWN, not a generic tick. It was a bare ✓, which
 * said only that something had been verified and left the reader to guess
 * what. Drawing badges.icon means the shield-check beside a name is the same
 * shield-check on the badges screen, and a badge added by a migration arrives
 * with its glyph already chosen — the same "data, not a switch on badge_key"
 * rule BadgeIcon is built on.
 *
 * SAME FOOTPRINT AS THE TICK IT REPLACES. w-4 h-4 against text-sm, inline and
 * vertically centred, one margin's gap. Nothing reflows.
 */
export function VerifiedCheck({
  verified,
  icon,
  title,
}: {
  verified: boolean;
  /** badges.icon for the badge the marker represents. */
  icon?: string | null;
  /** What was verified, e.g. "C-10 licence verified". */
  title?: string | null;
}) {
  if (!verified) return null;

  // Both fall back rather than render nothing. A profile fetched before the
  // view carried icon and label — or a badge seeded without an icon — should
  // still get a marker, because the account IS verified and that is the fact
  // the marker exists to carry.
  const label = title ?? "Verified";

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="ml-1 inline-flex items-center align-middle text-accent"
    >
      <BadgeIcon icon={icon ?? "shield-check"} className="w-4 h-4" />
    </span>
  );
}
