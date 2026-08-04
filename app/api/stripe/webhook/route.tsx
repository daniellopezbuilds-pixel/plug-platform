import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

      if (userId && conversationId) {
        await supabaseAdmin
          .from("conversation_participants")
          .update({ payment_status: "paid" })
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);
      }
    } else {
      // Existing messaging subscription flow
      const userId = session.metadata?.user_id;

      if (userId) {
        await supabaseAdmin
          .from("profiles")
          .update({ messaging_subscribed: true })
          .eq("id", userId);
      }
    }
  }

  return NextResponse.json({ received: true });
}