"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Ad = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
  placement: "jobs_board" | "marketplace" | "feed";
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  is_paid_ad: boolean;
  payment_status: string;
  amount_charged: number | null;
  created_at: string;
};

export function useAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("sponsored_listings")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setAds([]);
      setLoading(false);
      return;
    }

    setAds(data as Ad[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAd(input: {
    title: string;
    image_path: string;
    link_url: string;
    placement: "jobs_board" | "marketplace" | "feed";
    start_date?: string | null;
    end_date?: string | null;
    is_paid_ad?: boolean;
    payment_status?: string;
    amount_charged?: number | null;
  }) {
    const { error } = await supabase.from("sponsored_listings").insert({
      title: input.title,
      image_path: input.image_path,
      link_url: input.link_url || null,
      placement: input.placement,
      is_active: true,
      status: "approved",
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      is_paid_ad: input.is_paid_ad || false,
      payment_status: input.payment_status || "n/a",
      amount_charged: input.amount_charged ?? null,
    });

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function updateAd(
    id: string,
    updates: {
      title: string;
      link_url: string;
      placement: "jobs_board" | "marketplace" | "feed";
      image_path?: string;
      start_date?: string | null;
      end_date?: string | null;
      is_paid_ad?: boolean;
      payment_status?: string;
      amount_charged?: number | null;
    }
  ) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({
        title: updates.title,
        link_url: updates.link_url || null,
        placement: updates.placement,
        start_date: updates.start_date || null,
        end_date: updates.end_date || null,
        is_paid_ad: updates.is_paid_ad ?? false,
        payment_status: updates.payment_status || "n/a",
        amount_charged: updates.amount_charged ?? null,
        ...(updates.image_path ? { image_path: updates.image_path } : {}),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function toggleActive(id: string, currentValue: boolean) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({ is_active: !currentValue })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setAds((prev) =>
      prev.map((ad) => (ad.id === id ? { ...ad, is_active: !currentValue } : ad))
    );
  }

  async function deleteAd(id: string) {
    const { error } = await supabase.from("sponsored_listings").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setAds((prev) => prev.filter((ad) => ad.id !== id));
  }

  return { ads, loading, createAd, updateAd, toggleActive, deleteAd, reload: load };
}