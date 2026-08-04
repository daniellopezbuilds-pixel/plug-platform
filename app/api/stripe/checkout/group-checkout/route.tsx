import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const { userId, email, conversationId, feeCents, groupName } = await req.json();

    if (!userId || !email || !conversationId || !feeCents) {
      return NextResponse.json({ error: "Missing required information." }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: feeCents,
            product_data: {
              name: `Join group chat: ${groupName || "Group Chat"}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${req.nextUrl.origin}/dashboard/messages?group_checkout=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard/messages?group_checkout=cancelled`,
      metadata: {
        type: "group_join",
        user_id: userId,
        conversation_id: conversationId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}