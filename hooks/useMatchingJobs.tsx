"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RecentJob } from "@/hooks/useRecentJobs";

/**
 * The newest jobs asking for the signed-in worker's classification.
 *
 * AN EXACT MATCH, AND NAMED AS ONE. jobs.classification and
 * profiles.classification share one vocabulary (lib/signupRoles.tsx), so this
 * is a comparison, not a recommendation — the UI calls it "Jobs for
 * Journeymen", not "Recommended for you".
 *
 * With no classification on the profile it falls back to the newest jobs and
 * says so through `classification: null`, so the caller can label the list
 * honestly and nudge the profile.
 */
export function useMatchingJobs(limit = 5) {
  const [jobs, setJobs] = useState<RecentJob[]>([]);
  const [classification, setClassification] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("classification")
        .eq("id", user.id)
        .maybeSingle();

      const mine: string | null = profile?.classification ?? null;

      let query = supabase
        .from("jobs")
        .select("id, title, company, location, created_at, pay, pay_rate_min, pay_rate_max, pay_unit");
      if (mine) query = query.eq("classification", mine);

      const { data } = await query.order("created_at", { ascending: false }).limit(limit);

      if (cancelled) return;
      setClassification(mine);
      setJobs((data as RecentJob[]) ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { jobs, classification, loading };
}
