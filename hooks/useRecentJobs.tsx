"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type RecentJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  created_at: string;
  pay: string | null;
  pay_rate_min: number | string | null;
  pay_rate_max: number | string | null;
  pay_unit: string | null;
};

/**
 * The newest few jobs, for a side panel that points at the Jobs Board.
 *
 * Its own tiny query rather than useJobs(), which pages twelve full rows and
 * fetches every application you have made — both needed on the board and
 * neither needed to list four titles.
 */
export function useRecentJobs(limit = 4) {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("jobs")
      .select("id, title, company, location, created_at, pay, pay_rate_min, pay_rate_max, pay_unit")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (cancelled) return;
        setJobs((data as RecentJob[]) ?? []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { jobs, loading };
}
