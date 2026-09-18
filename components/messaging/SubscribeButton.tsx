"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useToast } from "@/components/ui/Toast";

export function SubscribeButton() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);

    // The route derives the user from this token, so nothing about who is
    // subscribing is sent in the body any more. getSession() is the local copy
    // — the server validates it before creating anything.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      toast.error("You must be logged in.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await res.json();

    if (data.error || !data.url) {
      toast.error(data.error || "Could not start checkout.");
      setLoading(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="bg-accent text-on-accent px-5 py-2.5 rounded-lg font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
    >
      <ButtonSpinner active={loading} />
      {loading ? "Redirecting..." : "Subscribe – $2/month"}
    </button>
  );
}