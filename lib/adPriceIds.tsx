import { AD_PLACEMENTS, type AdPlacement } from "@/lib/adPricing";

/**
 * Stripe Price ids, one per placement.
 *
 * SERVER ONLY. These are read from unprefixed environment variables, so they
 * resolve to undefined in the browser bundle — which would make every placement
 * look unconfigured rather than failing loudly. Import this from route handlers
 * only; the form learns what is configured from /api/ads/capacity.
 *
 * Kept out of lib/adPricing.tsx deliberately. That module is shared with the
 * client because the form needs the rates and the date arithmetic, and a price
 * id in a client module is a price id someone will eventually be tempted to
 * send from the browser. The whole point of the checkout route is that the
 * price comes from the environment and never from the request.
 *
 * Populated by scripts/create-ad-prices.mjs, which prints the three lines to
 * paste into .env.local.
 */

/**
 * Explicit rather than a template-string lookup into process.env. Three named
 * reads can be grepped; a dynamic key cannot, and would also break under any
 * build step that statically replaces env references.
 */
const PRICE_ID_BY_PLACEMENT: Record<AdPlacement, string | undefined> = {
  feed: process.env.STRIPE_AD_PRICE_FEED,
  jobs_board: process.env.STRIPE_AD_PRICE_JOBS_BOARD,
  marketplace: process.env.STRIPE_AD_PRICE_MARKETPLACE,
};

/** The configured Price id for a placement, or undefined if the env var is unset. */
export function adPriceIdFor(placement: AdPlacement) {
  return PRICE_ID_BY_PLACEMENT[placement];
}

export function isPlacementConfigured(placement: AdPlacement) {
  return Boolean(PRICE_ID_BY_PLACEMENT[placement]);
}

/**
 * Which placements can actually be bought right now.
 *
 * Reported to the form by /api/ads/capacity so the pay button can be replaced
 * before anyone fills in a campaign, rather than after they have uploaded an
 * image and been told "Advertising is not configured" by a 500.
 *
 * An unset env var is an operator problem, not a caller problem, so the message
 * the brand sees says the placement is unavailable and the detail goes to the
 * server log.
 */
export function configuredPlacements(): Record<string, boolean> {
  const out: Record<string, boolean> = {};

  for (const { value } of AD_PLACEMENTS) {
    out[value] = isPlacementConfigured(value);
  }

  return out;
}
