"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ActiveAd = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
};

export function useActiveAd(placement: "jobs_board" | "marketplace") {
  const [ad, setAd] = useState<ActiveAd | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data } = await supabase
        .from("ads")
        .select("id, title, image_path, link_url")
        .eq("placement", placement)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setAd(data || null);
      setLoading(false);
    }

    load();
  }, [placement]);

  return { ad, loading };
}