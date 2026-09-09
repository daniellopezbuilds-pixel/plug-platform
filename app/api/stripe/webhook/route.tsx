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
 * (conversation_participants.payment_status, added in
 * supabase/branding-deals-setup.sql section 5) — so a completed payment
 * granted nothing and left no trace. A silent failure in a webhook is the
 * worst kind: Stripe has taken the money and the app has no idea.
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

    if (type === "group_join") {
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
    } else {
      // Messaging subscription.
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
