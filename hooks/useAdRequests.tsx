"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AdRequest = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
  placement: "jobs_board" | "marketplace" | "feed";
  city: string | null;
  /** 'brand' for brand self-service submissions, 'internal' for house/job ads. */
  source: string | null;
  review_notes: string | null;
  start_date: string | null;
  end_date: string | null;
  is_paid_ad: boolean;
  payment_status: string;
  amount_charged: number | null;
  submitted_by: string;
  created_at: string;
  /** Embedded submitter, via the submitted_by foreign key. Null for house ads. */
  profiles: { full_name: string | null; profile_number: string | null } | null;
};

export function useAdRequests() {
  const [pending, setPending] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("sponsored_listings")
      // select("*") rather than an explicit column list on purpose: city and
      // review_notes may not exist yet (see supabase/branding-deals-setup.sql),
      // and naming them here would 400 the whole admin tab until that is run.
      .select("*, profiles!submitted_by(full_name, profile_number)")
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

  /**
   * The reason is stored on the row and shown back to the brand on
   * /dashboard/branding-deals, so it is feedback addressed to them, not an
   * internal note.
   */
  async function reject(id: string, reason: string) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({
        status: "rejected",
        is_active: false,
        review_notes: reason.trim(),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  return { pending, loading, approve, reject, reload: load };
}