import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/apiAuth";
import {
  adEndDate,
  isAdDurationMonths,
  isAdPlacement,
  todayIso,
  type AdPlacement,
} from "@/lib/adPricing";
import { checkAdCapacity } from "@/lib/adCapacity";
import { adPriceIdFor } from "@/lib/adPriceIds";

/**
 * Brand advertisement checkout.
 *
 * Creates the sponsored_listings row AND the Stripe Checkout Session, in that
 * order, and is the only path that writes a paid brand ad. The form no longer
 * inserts anything.
 *
 * WHY THE ROW IS WRITTEN HERE RATHER THAN BY THE FORM
 *
 * The brand used to insert its own row (RLS allows submitted_by = auth.uid()
 * with status 'pending') and put its own arithmetic in amount_charged. That is
 * fine right up to the moment money is involved: the amount on the row, the end
 * date, and the price Stripe charges would each be computed somewhere
 * different, and the row is the thing an admin reads when deciding what was
 * bought. Deriving end_date, duration and placement server-side, from the same
 * constants the line item is built from, is what makes the row and the receipt
 * the same statement.
 *
 * It also depends on something worth stating out loud: RLS lets only admins
 * UPDATE sponsored_listings, so a submitter cannot rewrite their row after
 * paying. That is load-bearing. Anyone who later "fixes" the UPDATE policy to
 * let brands edit their own campaigns reopens the door to a $199 marketplace ad
 * becoming a $299 feed ad after the money has changed hands.
 *
 * THE PRICE ID IS NEVER READ FROM THE REQUEST.
 *
 * It is looked up from the environment by placement, and the placement comes
 * from a validated allow-list. group-checkout took a price from the body once
 * and it cost a one-cent exploit; see the header of lib/apiAuth.tsx.
 */

const MAX_TITLE_LENGTH = 120;
const MAX_CITY_LENGTH = 80;
const MAX_LINK_LENGTH = 500;

/** Shape written by uploadAdImage() in lib/ads.tsx: ad-<timestamp>.<ext> */
const IMAGE_PATH_PATTERN = /^ad-\d+\.(png|jpe?g|webp)$/i;

/**
 * An ad's link is rendered as a bare href in both AdBanner and FeedAdCard.
 * React does not block a javascript: href, so an unchecked value here is stored
 * XSS on three public surfaces. Anything that is not http(s) is refused, and a
 * bare domain gets https:// prepended because the form's own placeholder
 * ("yourbrand.com/offer") invites one.
 *
 * NOTE: the other two write paths — the admin form in hooks/useAds.tsx and
 * useSubmitAdRequest — still store this column raw. Fixing those is a separate
 * change and is called out in the handover rather than done here.
 */
function normalizeAdLinkUrl(raw: string): {
  url: string | null;
  error: string | null;
} {
  const trimmed = raw.trim();

  if (!trimmed) return { url: null, error: null };

  if (trimmed.length > MAX_LINK_LENGTH) {
    return { url: null, error: "That link is too long." };
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasScheme ? trimmed : "https://" + trimmed;

  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    return { url: null, error: "Enter a valid link, or leave it blank." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, error: "Links must start with http:// or https://." };
  }

  return { url: parsed.toString(), error: null };
}

type ListingForCheckout = {
  id: string;
  placement: AdPlacement;
  durationMonths: number;
  /**
   * A Checkout Session already minted for this listing, on the resume path.
   * Expired before a new one is created — see the note in POST.
   */
  previousSessionId?: string | null;
};

type CheckoutFailure = { error: string; status: number };

function isFailure(
  result: ListingForCheckout | CheckoutFailure
): result is CheckoutFailure {
  return "error" in result;
}

export async function POST(req: NextRequest) {
  try {
    // Identity from the verified token, never from the body — the row's
    // submitted_by and the session's metadata.user_id both come from here.
    const user = await getUserFromRequest(req);

    if (!user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "Your account has no email address." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Missing campaign details." },
        { status: 400 }
      );
    }

    // Two ways in: resume an abandoned checkout, or start a new one.
    const listingId = typeof body.listingId === "string" ? body.listingId : null;

    const listing = listingId
      ? await resumeListing(listingId, user.id)
      : await createListing(body, user.id);

    if (isFailure(listing)) {
      return NextResponse.json(
        { error: listing.error },
        { status: listing.status }
      );
    }

    // Still checked here even though /api/ads/capacity reports configuration to
    // the form and the pay button is replaced when a placement is unbuyable.
    // That is a courtesy to the brand; this is the guarantee. Nothing stops a
    // caller posting straight to this route.
    const priceId = adPriceIdFor(listing.placement);

    if (!priceId) {
      // Misconfiguration, not a caller error. Fail loudly rather than reaching
      // for some other placement's price.
      console.error(
        "No Stripe price configured for placement '" +
          listing.placement +
          "' — run scripts/create-ad-prices.mjs and set the STRIPE_AD_PRICE_* vars"
      );
      return NextResponse.json(
        { error: "Advertising is not configured." },
        { status: 500 }
      );
    }

    // Abandoning a Checkout Session does not close it — it stays payable for
    // 24 hours. Without this, resuming would leave two live Sessions for one
    // campaign, and a brand with both tabs open could be charged twice for a
    // single month of one placement. The webhook would mark the first payment
    // and log the second as "matched no unpaid listing", which is a refund
    // nobody would notice was owed.
    //
    // Failure is ignored on purpose: expire() 400s on a Session that has
    // already expired or completed, and both mean there is nothing left to
    // close. A completed one is caught earlier anyway — resumeListing refuses a
    // listing that is already paid.
    if (listing.previousSessionId) {
      try {
        await stripe.checkout.sessions.expire(listing.previousSessionId);
      } catch {
        // Already expired, already completed, or gone. Nothing to do.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          // Months as quantity against a per-month price, which is why
          // create-ad-prices.mjs refuses to make these recurring.
          price: priceId,
          quantity: listing.durationMonths,
        },
      ],
      success_url:
        req.nextUrl.origin + "/dashboard/branding-deals?checkout=success",
      cancel_url:
        req.nextUrl.origin + "/dashboard/branding-deals?checkout=cancelled",
      metadata: {
        type: "ad_payment",
        listing_id: listing.id,
        user_id: user.id,
      },
    });

    // Recorded now so a later resume knows which Session to expire, and so an
    // abandoned campaign can still be traced to its attempt. The webhook writes
    // this column again with whichever Session actually paid, which is the one
    // that matters for reconciliation.
    //
    // Best effort. If it fails the checkout still works — metadata.listing_id
    // is what links the payment back, not this column — so the caller is not
    // failed over a bookkeeping write. It is logged because the cost is a
    // second payable Session surviving a resume.
    const { error: linkError } = await supabaseAdmin
      .from("sponsored_listings")
      .update({ stripe_session_id: session.id })
      .eq("id", listing.id)
      // Not if the webhook got there first: a paid row's session id is the one
      // that paid, and this one did not.
      .eq("payment_status", "unpaid");

    if (linkError) {
      console.error(
        "Could not record Stripe session on listing:",
        JSON.stringify({
          sessionId: session.id,
          listingId: listing.id,
          error: linkError.message,
        })
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    // Stripe's internal error text does not go back to the browser.
    console.error(
      "Ad checkout failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 }
    );
  }
}

/**
 * Validate the submitted campaign, check capacity, and write the row.
 *
 * The row lands unpaid and invisible: status 'pending', is_active false,
 * payment_status 'unpaid'. Nothing renders it and admin review does not list it
 * until the webhook marks it paid. amount_charged is left null on purpose — the
 * webhook fills it from what Stripe actually collected, so the figure on the
 * row is a receipt rather than a quote.
 */
async function createListing(
  body: Record<string, unknown>,
  userId: string
): Promise<ListingForCheckout | CheckoutFailure> {
  const { placement, durationMonths } = body;

  if (!isAdPlacement(placement)) {
    return { error: "Choose a placement.", status: 400 };
  }

  if (!isAdDurationMonths(durationMonths)) {
    return { error: "Choose a run length of 1, 3 or 6 months.", status: 400 };
  }

  // Before the insert, not after. The price check further down used to be the
  // first thing that noticed a missing STRIPE_AD_PRICE_* var, by which point
  // this function had already written an unpaid row — so a misconfigured
  // environment quietly accumulated orphaned campaigns, one per click, that
  // their owners could see and could never pay for.
  if (!adPriceIdFor(placement)) {
    console.error(
      "No Stripe price configured for placement '" +
        placement +
        "' — run scripts/create-ad-prices.mjs and set the STRIPE_AD_PRICE_* vars"
    );
    return {
      error: "That placement is unavailable right now.",
      status: 503,
    };
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) return { error: "Ad title is required.", status: 400 };

  if (title.length > MAX_TITLE_LENGTH) {
    return {
      error: "Ad title must be under " + MAX_TITLE_LENGTH + " characters.",
      status: 400,
    };
  }

  const city = typeof body.city === "string" ? body.city.trim() : "";

  if (!city) return { error: "Choose a city.", status: 400 };

  if (city.length > MAX_CITY_LENGTH) {
    return { error: "That city name is too long.", status: 400 };
  }

  const imagePath =
    typeof body.imagePath === "string" ? body.imagePath.trim() : "";

  // A shape check, not an existence check. The image was uploaded by the
  // browser before this call, so all the server can cheaply confirm is that the
  // path looks like one uploadAdImage produced rather than an arbitrary object
  // elsewhere in the bucket.
  if (!IMAGE_PATH_PATTERN.test(imagePath)) {
    return { error: "Upload an ad image before continuing.", status: 400 };
  }

  const { url: linkUrl, error: linkError } = normalizeAdLinkUrl(
    typeof body.linkUrl === "string" ? body.linkUrl : ""
  );

  if (linkError) return { error: linkError, status: 400 };

  const startDate = body.startDate;

  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: "Choose a start date.", status: 400 };
  }

  if (startDate < todayIso()) {
    return { error: "Start date cannot be in the past.", status: 400 };
  }

  // Derived, never accepted from the caller. The form shows the same value,
  // computed by the same function.
  const endDate = adEndDate(startDate, durationMonths);

  // Re-checked here whatever the form was showing. The form's copy of this
  // number is a courtesy, so a brand does not fill in a campaign it cannot buy;
  // this one is the answer.
  const { capacity, error: capacityError } = await checkAdCapacity(
    placement,
    startDate,
    endDate
  );

  if (capacityError || !capacity) {
    console.error("Ad capacity check failed:", capacityError);
    return { error: "Could not start checkout.", status: 500 };
  }

  if (capacity.full) {
    return {
      error: "This placement is fully booked for those dates.",
      status: 409,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("sponsored_listings")
    .insert({
      title,
      image_path: imagePath,
      link_url: linkUrl,
      placement,
      city,
      source: "brand",
      start_date: startDate,
      end_date: endDate,
      duration_months: durationMonths,
      is_active: false,
      status: "pending",
      is_paid_ad: true,
      payment_status: "unpaid",
      amount_charged: null,
      submitted_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Ad listing insert failed:", error?.message);
    return { error: "Could not start checkout.", status: 500 };
  }

  return { id: data.id, placement, durationMonths };
}

/**
 * Re-open checkout for a row that was created but never paid for.
 *
 * Everything is re-read from the row rather than taken from the request, so
 * resuming cannot change what is being bought — only the listing id crosses the
 * wire. Capacity is re-checked because the placement may have filled up while
 * the first session sat abandoned.
 */
async function resumeListing(
  listingId: string,
  userId: string
): Promise<ListingForCheckout | CheckoutFailure> {
  const { data, error } = await supabaseAdmin
    .from("sponsored_listings")
    .select(
      "id, placement, duration_months, start_date, end_date, payment_status, status, submitted_by, stripe_session_id"
    )
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    console.error("Ad resume lookup failed:", error.message);
    return { error: "Could not start checkout.", status: 500 };
  }

  // One message for "no such row" and "not yours", so this cannot be used to
  // discover which listing ids exist.
  if (!data || data.submitted_by !== userId) {
    return { error: "That campaign is not available.", status: 404 };
  }

  if (data.payment_status === "paid") {
    return { error: "That campaign is already paid for.", status: 409 };
  }

  if (data.payment_status !== "unpaid" || data.status !== "pending") {
    return { error: "That campaign can no longer be paid for.", status: 409 };
  }

  // Predates this flow, or was written by hand: there is no rate to charge.
  if (
    !isAdPlacement(data.placement) ||
    !isAdDurationMonths(data.duration_months) ||
    !data.start_date ||
    !data.end_date
  ) {
    return { error: "That campaign can no longer be paid for.", status: 409 };
  }

  // A start date that passed while the checkout sat abandoned would buy a run
  // that is already partly over. Refuse rather than silently shifting it.
  if (data.start_date < todayIso()) {
    return {
      error:
        "That campaign's start date has passed. Submit it again with new dates.",
      status: 409,
    };
  }

  const { capacity, error: capacityError } = await checkAdCapacity(
    data.placement,
    data.start_date,
    data.end_date
  );

  if (capacityError || !capacity) {
    console.error("Ad capacity check failed:", capacityError);
    return { error: "Could not start checkout.", status: 500 };
  }

  if (capacity.full) {
    return {
      error: "This placement is fully booked for those dates.",
      status: 409,
    };
  }

  return {
    id: data.id,
    placement: data.placement,
    durationMonths: data.duration_months,
    previousSessionId: data.stripe_session_id,
  };
}
