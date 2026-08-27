"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function SubscribeButton() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("You must be logged in.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, email: user.email }),
    });

    const data = await res.json();

    if (data.error || !data.url) {
      alert(data.error || "Could not start checkout.");
      setLoading(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="bg-white text-black px-5 py-2.5 rounded-lg font-semibold disabled:opacity-50"
    >
      {loading ? "Redirecting..." : "Subscribe – $2/month"}
    </button>
  );
}