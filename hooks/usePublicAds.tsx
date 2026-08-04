"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PublicAd = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
};

export function usePublicAds(placement: "jobs_board" | "marketplace" | "feed") {
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("sponsored_listings")
        .select("id, title, image_path, link_url, start_date, end_date")
        .eq("placement", placement)
        .eq("is_active", true)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error || !data) {
        setAds([]);
        setLoading(false);
        return;
      }

      const eligible = data.filter((ad) => {
        const startsOk = !ad.start_date || ad.start_date <= today;
        const endsOk = !ad.end_date || ad.end_date >= today;
        return startsOk && endsOk;
      });

      setAds(eligible);
      setLoading(false);
    }

    load();
  }, [placement]);

  return { ads, loading };
}