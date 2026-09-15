/**
 * Flat monthly placement rates for brand advertisements.
 *
 * Shared by the brand campaign form, the checkout route and the admin review
 * card, so all three quote the same number. Pure data and date arithmetic —
 * no Supabase, no Stripe, no `server-only` — because the form renders these
 * in the browser while the route charges against them on the server.
 *
 * THE STRIPE PRICE IDS ARE NOT HERE. They are environment variables read in
 * app/api/stripe/checkout/ad/route.tsx and nowhere else: a price id in a
 * module the client bundles is a price id the client can be tempted to send.
 * What lives here is the *display* amount, and the two are kept honest by
 * scripts/create-ad-prices.mjs, which refuses to run if a live Stripe price
 * has drifted from the matching `monthlyCents` below.
 */

export const AD_PLACEMENTS = [
  { value: "feed", label: "Feed", monthlyCents: 29900 },
  { value: "jobs_board", label: "Job board", monthlyCents: 24900 },
  { value: "marketplace", label: "Marketplace", monthlyCents: 19900 },
] as const;

export type AdPlacement = (typeof AD_PLACEMENTS)[number]["value"];

/** The only run lengths sold. Mirrored by a CHECK on duration_months. */
export const AD_DURATIONS_MONTHS = [1, 3, 6] as const;

export type AdDurationMonths = (typeof AD_DURATIONS_MONTHS)[number];

/**
 * How many campaigns may hold one placement over any overlapping date window.
 *
 * Not a rendering limit — usePublicAds rotates through everything eligible.
 * It is an inventory limit: past this, a brand's ad is in the rotation so
 * rarely that selling another month of it would be dishonest.
 */
export const AD_PLACEMENT_CAP = 5;

export function isAdPlacement(value: unknown): value is AdPlacement {
  return AD_PLACEMENTS.some((p) => p.value === value);
}

export function isAdDurationMonths(value: unknown): value is AdDurationMonths {
  return (AD_DURATIONS_MONTHS as readonly number[]).includes(value as number);
}

export function adPlacementLabel(placement: string) {
  return AD_PLACEMENTS.find((p) => p.value === placement)?.label ?? placement;
}

export function monthlyCentsFor(placement: AdPlacement) {
  // The find cannot miss — isAdPlacement is the type guard that produces the
  // argument — but a non-null assertion here would be the one line that turns
  // a bad env or a stale cast into a runtime crash inside a checkout.
  const found = AD_PLACEMENTS.find((p) => p.value === placement);
  return found ? found.monthlyCents : 0;
}

/**
 * Quantity x months, in cents. The same multiplication Stripe performs on the
 * line item, so the total on the form is the total on the card statement.
 */
export function totalCentsFor(placement: AdPlacement, months: number) {
  return monthlyCentsFor(placement) * months;
}

export function formatUsd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Last day a campaign runs, given its first day and length in months.
 *
 * Inclusive, because that is how eligibility is evaluated everywhere else:
 * usePublicAds keeps an ad while `end_date >= today`. So one month from the
 * 1st ends on the last day of that month, not on the 1st of the next.
 *
 * Done on the date parts rather than with Date arithmetic on the input. Adding
 * a month to 31 January with setMonth gives 3 March, because 31 February rolls
 * forward; clamping to the target month's last day is what people mean by "a
 * month later". UTC throughout so a machine west of Greenwich does not shift
 * the day.
 */
export function adEndDate(startDate: string, months: number) {
  const [year, month, day] = startDate.split("-").map(Number);

  if (!year || !month || !day) return startDate;

  const targetMonth = month - 1 + months; // 0-based, may exceed 11
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalisedMonth = ((targetMonth % 12) + 12) % 12;

  // Day 0 of the following month is the last day of this one.
  const lastDayOfTarget = new Date(
    Date.UTC(targetYear, normalisedMonth + 1, 0)
  ).getUTCDate();

  const clamped = day > lastDayOfTarget;

  const end = new Date(
    Date.UTC(targetYear, normalisedMonth, Math.min(day, lastDayOfTarget))
  );

  // The day before the anniversary is the last day of the term — except when
  // the anniversary had to be clamped, because then there was no such date to
  // step back from and the clamp has already shortened the run. Subtracting
  // again would bill a month starting 31 January to 27 February and pocket the
  // difference. It ends on the 28th.
  if (!clamped) end.setUTCDate(end.getUTCDate() - 1);

  return end.toISOString().split("T")[0];
}

/** Today in the same YYYY-MM-DD shape the date columns and inputs use. */
export function todayIso() {
  return new Date().toISOString().split("T")[0];
}
