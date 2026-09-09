import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/apiAuth";

/**
 * Group-chat join fee.
 *
 * The amount is a Stripe Price, referenced by id from the environment, the
 * same way the messaging subscription uses STRIPE_PRICE_ID. It is never read
 * from the request body: this route previously took `feeCents` from the caller
 * and passed it straight into the line item, so anyone could join a paid group
 * for a cent by editing the request.
 *
 * There is no fee column on `conversations` (see docs/schema-inventory.md), so
 * the price cannot yet vary per group. One env-configured price for all groups
 * is the honest version of that. Per-group pricing means a column on
 * conversations and a lookup here — not a number from the client.
 */
const GROUP_JOIN_PRICE_ID = process.env.STRIPE_GROUP_JOIN_PRICE_ID;

export async function POST(req: NextRequest) {
  try {
    // Identity comes from the verified token, never from the body. The old
    // version trusted `userId` from JSON, which the webhook then wrote into
    // conversation_participants as `metadata.user_id`.
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

    if (!GROUP_JOIN_PRICE_ID) {
      // Misconfiguration, not a caller error. Fail loudly rather than falling
      // back to some default amount.
      console.error("STRIPE_GROUP_JOIN_PRICE_ID is not set");
      return NextResponse.json(
        { error: "Group joining is not configured." },
        { status: 500 }
      );
    }

    const { conversationId } = await req.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "Missing conversation." },
        { status: 400 }
      );
    }

    // Confirm the conversation exists and is actually a group, so this route
    // cannot be used to mint a checkout session against an arbitrary uuid.
    //
    // Read with the service role deliberately: RLS on conversations is not in
    // version control (supabase/README.md), and a security check must not
    // depend on a policy nobody here can read. This is a bare existence check
    // on one row, and nothing from it is returned to the caller.
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .select("id, is_group")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError) {
      console.error("Group checkout conversation lookup failed:", conversationError.message);
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 500 }
      );
    }

    if (!conversation || !conversation.is_group) {
      // Same message for "no such conversation" and "not a group", so this
      // cannot be used to probe which conversation ids exist.
      return NextResponse.json(
        { error: "That group chat is not available." },
        { status: 404 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          // Price and product name both come from Stripe. The old version
          // built product_data.name from a client-supplied `groupName`, which
          // put caller-controlled text on the checkout page.
          price: GROUP_JOIN_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${req.nextUrl.origin}/dashboard/messages?group_checkout=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard/messages?group_checkout=cancelled`,
      metadata: {
        type: "group_join",
        user_id: user.id,
        conversation_id: conversation.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    // Don't hand Stripe's internal error text back to the browser.
    console.error("Group checkout failed:", error?.message);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
