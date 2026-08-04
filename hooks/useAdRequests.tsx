"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdRequest = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
  placement: "jobs_board" | "marketplace" | "feed";
  start_date: string | null;
  end_date: string | null;
  is_paid_ad: boolean;
  payment_status: string;
  amount_charged: number | null;
  submitted_by: string;
  created_at: string;
};

export function useAdRequests() {
  const [pending, setPending] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("sponsored_listings")
      .select(
        "id, title, image_path, link_url, placement, start_date, end_date, is_paid_ad, payment_status, amount_charged, submitted_by, created_at"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error || !data) {
      setPending([]);
      setLoading(false);
      return;
    }

    setPending(data as AdRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(
    id: string,
    overrides: {
      start_date: string;
      end_date: string;
      is_paid_ad: boolean;
      payment_status: string;
      amount_charged: number | null;
    }
  ) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({
        status: "approved",
        is_active: true,
        start_date: overrides.start_date,
        end_date: overrides.end_date,
        is_paid_ad: overrides.is_paid_ad,
        payment_status: overrides.payment_status,
        amount_charged: overrides.amount_charged,
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function reject(id: string) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({ status: "rejected", is_active: false })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  }

  return { pending, loading, approve, reject, reload: load };
}