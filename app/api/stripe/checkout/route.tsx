import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getUserFromRequest } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  try {
    // The price here was already server-side (STRIPE_PRICE_ID), but `userId`
    // and `email` came from the request body. The webhook writes
    // messaging_subscribed against metadata.user_id, so a caller could pay and
    // have the subscription land on someone else's account. Identity now comes
    // from the verified token and the body is not read at all.
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

    if (!process.env.STRIPE_PRICE_ID) {
      console.error("STRIPE_PRICE_ID is not set");
      return NextResponse.json(
        { error: "Subscriptions are not configured." },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${req.nextUrl.origin}/dashboard/messages?checkout=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard/messages?checkout=cancelled`,
      metadata: {
        user_id: user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout failed:", error?.message);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
