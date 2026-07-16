"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Ad = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
  placement: "jobs_board" | "marketplace";
  is_active: boolean;
  created_at: string;
};

export function useAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("ads")
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
    placement: "jobs_board" | "marketplace";
  }) {
    const { error } = await supabase.from("ads").insert({
      title: input.title,
      image_path: input.image_path,
      link_url: input.link_url || null,
      placement: input.placement,
      is_active: true,
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
      placement: "jobs_board" | "marketplace";
      image_path?: string;
    }
  ) {
    const { error } = await supabase
      .from("ads")
      .update({
        title: updates.title,
        link_url: updates.link_url || null,
        placement: updates.placement,
        ...(updates.image_path ? { image_path: updates.image_path } : {}),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function toggleActive(id: string, currentValue: boolean) {
    const { error } = await supabase
      .from("ads")
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
    const { error } = await supabase.from("ads").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setAds((prev) => prev.filter((ad) => ad.id !== id));
  }

  return { ads, loading, createAd, updateAd, toggleActive, deleteAd, reload: load };
}