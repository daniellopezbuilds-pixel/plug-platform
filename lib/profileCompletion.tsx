/**
 * What makes a profile complete. THE ONLY DEFINITION — there is not a second
 * one anywhere, and adding one is the bug this file exists to prevent.
 *
 * Two surfaces read it and they must agree:
 *
 *   - the "Profile" percentage on the worker dashboard
 *   - the dismissible completion banner above it
 *
 * They used to disagree. The percentage counted full_name, username, trade, bio
 * and email; the banner counts trade, bio and photo. An account with no photo
 * read 100% with "Your profile is missing one thing" directly underneath it,
 * which does not look like two rules — it looks like the page is broken.
 *
 * The three fields below won. full_name and email are written at signup and are
 * never empty, so counting them only inflated the number; username is not
 * something we ask anyone to fill in. A percentage should count exactly what
 * the banner would ask for, or it is measuring something nobody can act on.
 *
 * SCOPE: none of this gates anything. Nothing is withheld from an incomplete
 * profile and nothing should be.
 */

/**
 * Signup types the banner does NOT apply to.
 *
 * An exclusion list rather than an inclusion list, because the answer is
 * "everyone except brands". A trade, a bio and a photo of a person do not
 * describe a distributor — brand signup collects a category and a website
 * instead, and there is a separate brand dashboard.
 *
 * NULL signup_type IS INCLUDED, deliberately. Those are the pre-taxonomy rows
 * that 20260916130000 left NULL rather than guess at — the oldest accounts,
 * and in practice the emptiest profiles, so they are the ones the prompt is
 * most worth showing to. An inclusion list would have silently skipped exactly
 * the population that needs it.
 */
const UNPROMPTED_SIGNUP_TYPES = ["brand"] as const;

/**
 * The columns this reads. A structural type rather than an import, so a caller
 * can hand it any row shape that carries these four.
 */
export type CompletionProfile = {
  signup_type: string | null;
  trade: string | null;
  bio: string | null;
  /**
   * The profile photo. It is called company_logo_path because it was added for
   * employers, but it is the round image rendered beside the name on the public
   * profile, the marketplace card and the application card — for an individual
   * account it IS their photo, and there is no other image column.
   */
  company_logo_path: string | null;
};

/**
 * The three fields, with the wording the banner shows.
 *
 * Labels match the profile page's own labels, because the banner's whole job is
 * to send someone there to fill these in. A checklist naming a field the
 * destination page does not have is worse than no checklist.
 */
export const COMPLETION_FIELDS: readonly {
  label: string;
  isMissing: (profile: CompletionProfile) => boolean;
}[] = [
  { label: "Trade", isMissing: (p) => !p.trade?.trim() },
  { label: "Bio", isMissing: (p) => !p.bio?.trim() },
  {
    label: "Profile photo",
    isMissing: (p) => !p.company_logo_path?.trim(),
  },
];

/** Labels of the fields still empty, in the order above. */
export function missingProfileFields(profile: CompletionProfile): string[] {
  return COMPLETION_FIELDS.filter((field) => field.isMissing(profile)).map(
    (field) => field.label
  );
}

/**
 * How complete this profile is, 0-100, over the same three fields the banner
 * checks. Rounded, so the steps are 0 / 33 / 67 / 100.
 *
 * Coarser than the five-field percentage it replaces, and that is the point:
 * every step now corresponds to something the owner can actually go and do,
 * and 100% now means the banner is gone.
 *
 * Says nothing useful about a brand — it counts fields brands do not have — but
 * brands are never shown it, because the percentage lives on the worker
 * dashboard and a brand gets BrandDashboard instead.
 */
export function profileCompletionPercentage(profile: CompletionProfile): number {
  const filled = COMPLETION_FIELDS.length - missingProfileFields(profile).length;

  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

/**
 * Does this account get asked at all?
 *
 * Everyone but a brand, including the legacy rows with no signup_type — see
 * UNPROMPTED_SIGNUP_TYPES.
 */
export function shouldPromptCompletion(profile: CompletionProfile): boolean {
  if (
    UNPROMPTED_SIGNUP_TYPES.includes(
      profile.signup_type as (typeof UNPROMPTED_SIGNUP_TYPES)[number]
    )
  ) {
    return false;
  }

  return missingProfileFields(profile).length > 0;
}

/**
 * Dismissal, per user, in localStorage.
 *
 * WHY NOT A COLUMN. A column would survive a change of browser, and this does
 * not. It is a deliberate trade: the requirement is that dismissing sticks
 * rather than the banner returning on every page load, and localStorage clears
 * that bar with no migration and no write on a read path. The cost is that
 * someone who dismisses it on a laptop sees it once more on their phone. If
 * that matters, it is one nullable timestamptz column and this file is the only
 * thing that changes.
 *
 * Keyed by user id, not a bare key: two accounts sharing a browser are two
 * different answers, and a shared key would dismiss the banner for a colleague
 * who never saw it.
 *
 * Mirrors the MODE_INIT_KEY pattern in hooks/useActiveRole.tsx, including the
 * failure behaviour — see below.
 */
const DISMISSED_KEY = "sparx:profile-prompt-dismissed:";

export function isCompletionDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY + userId) === "1";
  } catch {
    // Private mode, or site data blocked. Treat as ALREADY DISMISSED rather
    // than as never dismissed: the alternative is a banner that reappears on
    // every single load and whose dismiss button provably cannot work, which is
    // the exact nagging this is supposed not to do. Losing the prompt is the
    // better failure.
    return true;
  }
}

export function dismissCompletion(userId: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY + userId, "1");
  } catch {
    /* nothing to do — see above. The banner still hides for this page view,
       because the component holds its own state as well. */
  }
}
