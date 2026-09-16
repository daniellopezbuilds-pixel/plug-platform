/**
 * The single check mark beside a name.
 *
 * ONE MARK, NOT A ROW OF ICONS. It means "this account holds at least one
 * verification badge" and nothing more specific. Which badges, and what each
 * one required, belong on the profile's badges section — not inline next to
 * every mention of someone's name.
 *
 * IT MEANS VERIFIED, NOT DECORATED. The caller passes the result of
 * hasVerifiedBadge() from useProfileBadges, which counts only badges in the
 * 'verification' category. early_member is a community badge and deliberately
 * does not light this up: a check mark next to a name reads as "we checked who
 * this is", and awarding it for signing up early would make that a lie on every
 * one of the first hundred accounts.
 */
export function VerifiedCheck({ verified }: { verified: boolean }) {
  if (!verified) return null;

  return (
    <span
      title="Verified"
      aria-label="Verified"
      role="img"
      className="ml-1 inline-flex items-center text-accent text-sm font-bold align-middle"
    >
      ✓
    </span>
  );
}
