import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// This route does a tiny, harmless read from the database.
// Vercel Cron hits this once a day so Supabase sees "activity"
// and doesn't auto-pause the project after 7 days of inactivity.
export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Keep-alive query failed:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Supabase pinged successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Keep-alive route crashed:", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}