"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useProfileStats(profileId: string | null) {
  const [hiredCount, setHiredCount] = useState(0);
  const [jobsLandedCount, setJobsLandedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      return;
    }
    load();
  }, [profileId]);

  async function load() {
    setLoading(true);

    const { count: hired } = await supabase
      .from("applications")
      .select("id, jobs!inner(user_id)", { count: "exact", head: true })
      .eq("status", "accepted")
      .eq("jobs.user_id", profileId);

    const { count: landed } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .eq("worker_id", profileId);

    setHiredCount(hired || 0);
    setJobsLandedCount(landed || 0);
    setLoading(false);
  }

  return { hiredCount, jobsLandedCount, loading };
}