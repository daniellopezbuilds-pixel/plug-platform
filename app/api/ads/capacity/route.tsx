import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { checkAdCapacity } from "@/lib/adCapacity";
import { configuredPlacements } from "@/lib/adPriceIds";
import {
  AD_PLACEMENTS,
  AD_PLACEMENT_CAP,
  adEndDate,
  isAdDurationMonths,
  todayIso,
} from "@/lib/adPricing";

/**
 * Remaining inventory on each placement for a proposed run, so the campaign
 * form can show "fully booked" instead of a pay button.
 *
 * This is a read, and the form could in principle do it itself — except that it
 * could not do it correctly. Under a brand's own RLS the count returns their
 * own pending rows plus everyone's live ones, and misses every other brand's
 * paid-but-unreviewed campaign. A client-side count can therefore only
 * under-report, and under-reporting inventory is overselling it. So the count
 * happens here with the service role. See lib/adCapacity.tsx.
 *
 * Authenticated like every other route under app/api/, per the convention in
 * lib/apiAuth.tsx. It is not a public price list: it reports how full each
 * surface is, which is commercial information about other brands' campaigns,
 * and it costs three counting queries per call.
 *
 * Advisory only. /api/stripe/checkout/ad re-runs the same check before it
 * writes anything, because nothing stops a caller skipping this route entirely.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const startDate = req.nextUrl.searchParams.get("startDate") ?? "";
  const durationMonths = Number(
    req.nextUrl.searchParams.get("durationMonths") ?? ""
  );

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Invalid start date." }, { status: 400 });
  }

  if (!isAdDurationMonths(durationMonths)) {
    return NextResponse.json({ error: "Invalid run length." }, { status: 400 });
  }

  // A past start date is refused at checkout, but answering here anyway keeps
  // the form's display from going blank while someone is still editing a date.
  const from = startDate < todayIso() ? todayIso() : startDate;
  const endDate = adEndDate(from, durationMonths);

  const results = await Promise.all(
    AD_PLACEMENTS.map(async ({ value }) => {
      const { capacity, error } = await checkAdCapacity(value, from, endDate);
      return { placement: value, capacity, error };
    })
  );

  const failed = results.find((r) => r.error || !r.capacity);

  if (failed) {
    console.error("Ad capacity lookup failed:", failed.error);
    return NextResponse.json(
      { error: "Could not check availability." },
      { status: 500 }
    );
  }

  // Keyed by placement so the form can index straight into it.
  // Whether a placement can be bought at all, which is a different question
  // from whether it has room. A missing STRIPE_AD_PRICE_* var used to surface
  // only as a 500 from the checkout route — after the brand had filled in the
  // form and uploaded an image. Reporting it here lets the form replace the pay
  // button up front, the same way it does for a fully-booked placement.
  //
  // Only a boolean crosses the wire. The price ids themselves stay server-side;
  // see lib/adPriceIds.tsx.
  const configured = configuredPlacements();

  const placements: Record<
    string,
    { taken: number; cap: number; full: boolean; configured: boolean }
  > = {};

  for (const { placement, capacity } of results) {
    placements[placement] = {
      taken: capacity!.count,
      cap: capacity!.cap,
      full: capacity!.full,
      configured: configured[placement] ?? false,
    };
  }

  return NextResponse.json({
    startDate: from,
    endDate,
    cap: AD_PLACEMENT_CAP,
    // True when at least one placement is buyable. The form uses it to tell
    // "this surface is sold out" apart from "advertising is switched off".
    configured: Object.values(configured).some(Boolean),
    placements,
  });
}
