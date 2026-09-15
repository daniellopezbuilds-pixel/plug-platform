import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Stripe webhook.
 *
 * @public-route — called by Stripe, not by a signed-in user, so there is no
 * token to verify. What protects it instead is
 * stripe.webhooks.constructEvent(), which rejects any body whose signature
 * does not match STRIPE_WEBHOOK_SECRET before a single line below it runs.
 * That check is not optional and must stay first.
 *
 * Signature-verified before any write, and the only place besides
 * /api/keep-alive that uses the service role. The metadata read below is
 * trustworthy because it comes back from Stripe on a signed event, not from a
 * caller — the checkout routes set it from a verified token.
 *
 * Every write here is error-checked. They were not before, and the group_join
 * branch in particular was writing to a column that did not exist
 * (conversation_participants.payment_status, added in section 3 of
 * supabase/migrations/20260909110000_branding_deals_columns.sql) — so a
 * completed payment granted nothing and left no trace. A silent failure in a
 * webhook is the worst kind: Stripe has taken the money and the app has no
 * idea.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const type = session.metadata?.type;

    // Dispatch is on an explicit list, and anything unrecognised is logged
    // rather than handled. It used to be `if (group_join) … else → messaging
    // subscription`, which meant the subscription branch was also the default:
    // the first new checkout type added anywhere would have silently granted a
    // messaging subscription to whoever paid for something else. The messaging
    // route sets no `type` at all, so undefined is its marker and has to stay
    // spelled out here rather than being whatever is left over.
    if (type === "ad_payment") {
      const listingId = session.metadata?.listing_id;

      if (!listingId) {
        console.error(
          "Stripe ad_payment event is missing listing_id metadata:",
          session.id
        );
      } else {
        // amount_total is what Stripe actually collected, in cents. Writing
        // that rather than recomputing the rate x months makes amount_charged a
        // receipt instead of a second opinion — if the two ever disagree, the
        // card statement wins, and this is the number an admin reads at review.
        const amountCharged =
          typeof session.amount_total === "number"
            ? session.amount_total / 100
            : null;

        const { data, error } = await supabaseAdmin
          .from("sponsored_listings")
          .update({
            payment_status: "paid",
            status: "pending",
            is_paid_ad: true,
            amount_charged: amountCharged,
            stripe_session_id: session.id,
          })
          .eq("id", listingId)
          // Only an unpaid row is advanced. Stripe redelivers events, and a
          // replay days later must not drag an approved or rejected campaign
          // back to 'pending' — which the status write above would otherwise
          // do. A redelivery of an already-processed event therefore matches
          // nothing, which is the correct outcome and is not an error.
          .eq("payment_status", "unpaid")
          .select("id");

        if (error) {
          // Paid and not marked. Logged with the Stripe session id so it can be
          // reconciled by hand.
          console.error(
            "PAID BUT NOT MARKED — ad payment write failed:",
            JSON.stringify({
              sessionId: session.id,
              listingId,
              error: error.message,
            })
          );
        } else if (!data || data.length === 0) {
          // Either a redelivery (fine) or a listing that vanished (not fine),
          // and this cannot tell them apart. Logged at a lower key than the
          // failure above for that reason.
          console.warn(
            "Ad payment matched no unpaid listing — already processed, or the row is gone:",
            JSON.stringify({ sessionId: session.id, listingId })
          );
        }
      }
    } else if (type === "group_join") {
      const userId = session.metadata?.user_id;
      const conversationId = session.metadata?.conversation_id;

      if (!userId || !conversationId) {
        console.error(
          "Stripe group_join event is missing metadata:",
          JSON.stringify({ sessionId: session.id, userId, conversationId })
        );
      } else {
        const { error } = await supabaseAdmin
          .from("conversation_participants")
          .update({ payment_status: "paid" })
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);

        if (error) {
          // Paid and not granted. Logged with the Stripe session id so the
          // payment can be reconciled by hand.
          console.error(
            "PAID BUT NOT GRANTED — group_join write failed:",
            JSON.stringify({
              sessionId: session.id,
              conversationId,
              userId,
              error: error.message,
            })
          );
        }
      }
    } else if (type === undefined) {
      // Messaging subscription. /api/stripe/checkout sets no `type`, so the
      // absence of one is its marker — matched explicitly rather than by
      // falling through, so a future checkout route that forgets its `type`
      // lands in the warning below instead of granting a subscription.
      const userId = session.metadata?.user_id;

      if (!userId) {
        console.error(
          "Stripe subscription event is missing user_id metadata:",
          session.id
        );
      } else {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ messaging_subscribed: true })
          .eq("id", userId);

        if (error) {
          console.error(
            "PAID BUT NOT GRANTED — messaging subscription write failed:",
            JSON.stringify({ sessionId: session.id, userId, error: error.message })
          );
        }
      }
    } else {
      // A completed payment nobody here knows what to do with. Money has
      // changed hands, so this is an error and not a shrug.
      console.error(
        "PAID BUT UNHANDLED — unknown checkout metadata type:",
        JSON.stringify({ sessionId: session.id, type })
      );
    }
  }

  // Always 200, even when a write failed.
  //
  // A non-2xx makes Stripe retry, and a retry cannot help here: a missing
  // column or a failed update will fail again identically, and Stripe would
  // keep redelivering for days. The failure is recorded above for manual
  // reconciliation instead. If these writes are ever made genuinely
  // retry-safe, returning 500 on error becomes the better behaviour.
  return NextResponse.json({ received: true });
}
