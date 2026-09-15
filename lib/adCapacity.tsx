import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AD_PLACEMENT_CAP, type AdPlacement } from "@/lib/adPricing";

/**
 * Placement inventory: how much of one surface is already sold over a window.
 *
 * SERVER ONLY. It reads with the service role, so importing this into a client
 * component would fail at build (SUPABASE_SERVICE_ROLE_KEY is not a
 * NEXT_PUBLIC_ var) and would be a serious mistake if it did not.
 *
 * The service role is not an optimisation here, it is the whole point. Under
 * the caller's own RLS this count would return their own pending rows plus
 * everyone's live ones — which is precisely the wrong number. The rows that
 * matter most are other brands' campaigns that are paid for and waiting on
 * admin review, and those are invisible to a brand by design.
 *
 * That is also why /api/ads/capacity exists rather than the form counting for
 * itself: a client-side count can only ever under-report, and under-reporting
 * inventory means overselling it.
 */

export type CapacityResult = {
  count: number;
  cap: number;
  full: boolean;
};

/**
 * Campaigns holding `placement` over any window overlapping [startDate,
 * endDate], inclusive at both ends.
 *
 * Overlap rather than "live right now" on purpose. Counting only what is live
 * today ignores every paid campaign still awaiting review, so five live plus
 * ten starting tomorrow would all go out at once and the cap would have
 * measured nothing. What is being sold is a share of one surface over a span of
 * dates, so a span of dates is what gets counted.
 *
 * NULL dates mean unbounded, matching how usePublicAds evaluates eligibility: a
 * house ad with no dates runs forever and therefore overlaps everything.
 *
 * Excluded:
 *   - rejected rows, which will never run
 *   - unpaid rows, so an abandoned checkout cannot hold inventory hostage
 *
 * Included: house ads and free /dashboard/requests submissions, both of which
 * carry payment_status 'n/a'. They occupy the surface as much as a paid ad
 * does, so they count against it.
 */
export async function countOverlappingAds(
  placement: AdPlacement,
  startDate: string,
  endDate: string
): Promise<{ count: number | null; error: string | null }> {
  const { count, error } = await supabaseAdmin
    .from("sponsored_listings")
    .select("id", { count: "exact", head: true })
    .eq("placement", placement)
    .neq("status", "rejected")
    .neq("payment_status", "unpaid")
    // Two .or() calls AND together in PostgREST, giving the standard overlap
    // test (a.start <= b.end AND a.end >= b.start) with nulls read as open
    // ended on either side.
    .or("start_date.is.null,start_date.lte." + endDate)
    .or("end_date.is.null,end_date.gte." + startDate);

  if (error) return { count: null, error: error.message };

  return { count: count ?? 0, error: null };
}

/**
 * The same count, packaged with the verdict.
 *
 * Note what this deliberately does not do: reserve anything. Two brands
 * checking out for the last slot at the same moment will both be told there is
 * room, and both will pay. At a cap of 5 on three surfaces, with every campaign
 * passing through human review before it runs, that is a reconciliation an
 * admin can make — and the alternative is a lock or an exclusion constraint
 * over a date range, which is a lot of machinery for a race nobody has lost
 * yet. Revisit when the surfaces are genuinely contended.
 */
export async function checkAdCapacity(
  placement: AdPlacement,
  startDate: string,
  endDate: string
): Promise<{ capacity: CapacityResult | null; error: string | null }> {
  const { count, error } = await countOverlappingAds(
    placement,
    startDate,
    endDate
  );

  if (error || count === null) {
    return { capacity: null, error: error ?? "Could not read capacity." };
  }

  return {
    capacity: {
      count,
      cap: AD_PLACEMENT_CAP,
      full: count >= AD_PLACEMENT_CAP,
    },
    error: null,
  };
}
