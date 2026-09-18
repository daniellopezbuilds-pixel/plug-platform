/**
 * Where someone is, as a list rather than a text box.
 *
 * ONE LIST, TWO CALLERS. These cities started life inside
 * app/dashboard/branding-deals/page.tsx as the ad-targeting city select. Signup
 * now asks the same question of every account, and a brand buying "electricians
 * in Fresno" only matches profiles if both ends spell Fresno the same way — so
 * the targeting list and the profile list have to be the same list, not two
 * lists that happen to agree today.
 *
 * EDIT THIS LIST FREELY. Like lib/trades.tsx this is vocabulary, not schema:
 * profiles.location is plain text with no CHECK constraint, matched with ilike
 * in hooks/useDirectory.tsx and hooks/useDashboardStats.tsx. Adding, renaming
 * or reordering needs no migration.
 *
 * What a rename DOES affect: stored rows keep the old string and fall through
 * to "Other" on the forms. Recoverable — the value is still shown and still
 * saved — but it is the reason to add rather than rename.
 */
export const CALIFORNIA_CITIES = [
  "Los Angeles",
  "San Diego",
  "San Jose",
  "San Francisco",
  "Fresno",
  "Sacramento",
  "Long Beach",
  "Oakland",
  "Bakersfield",
  "Anaheim",
  "Santa Ana",
  "Riverside",
  "Stockton",
  "Irvine",
  "Chula Vista",
  "Fremont",
  "San Bernardino",
  "Modesto",
  "Fontana",
  "Oxnard",
] as const;

/**
 * Statewide targeting, which is an ad concept and not a place anybody lives.
 *
 * Kept out of CALIFORNIA_CITIES so it cannot end up in profiles.location, where
 * it would mean nothing to the two ilike searches that read that column.
 */
export const ALL_OF_CALIFORNIA = "All of California";

/** The ad form's options: statewide first, then the same cities. */
export const AD_TARGET_CITIES = [
  ALL_OF_CALIFORNIA,
  ...CALIFORNIA_CITIES,
] as const;

/**
 * The sentinel for "not one of the above".
 *
 * A literal that cannot collide with a real city, because the select's value is
 * compared against the list to decide whether to reveal the free-text box.
 * Mirrors OTHER_TRADE in lib/trades.tsx.
 */
export const OTHER_LOCATION = "__other__";

/**
 * The listed city a stored location refers to, or null.
 *
 * NOT a plain includes(), and the difference matters for every account that
 * already exists. The old profile field was free text with the placeholder
 * "Location (e.g. Los Angeles, CA)", so the rows in the database are mostly
 * "Los Angeles, CA" — which an exact match would push into "Other", for very
 * nearly everybody, on a form that is supposed to be tidying this column up.
 *
 * So a trailing state is tolerated: "Los Angeles, CA" and "Los Angeles,
 * California" both resolve to the Los Angeles option. The stored value is left
 * alone until the user saves; it only narrows to the bare city if they choose
 * one. Anything with more parts than that ("Van Nuys, Los Angeles, CA") is a
 * real Other and stays one — the extra part is information we should not throw
 * away by guessing.
 */
export function listedCityFor(value: string | null | undefined): string | null {
  if (!value) return null;

  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const city =
    parts.length === 1
      ? parts[0]
      : parts.length === 2 && /^(ca|california)$/i.test(parts[1])
      ? parts[0]
      : null;

  if (!city) return null;

  return (
    CALIFORNIA_CITIES.find((c) => c.toLowerCase() === city.toLowerCase()) ?? null
  );
}
