"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ApplicationWithJob = {
  id: string;
  status: string;
  created_at: string;
  jobs: {
    id: string;
    title: string;
    location: string | null;
    pay: string | null;
    description: string | null;
    user_id: string;
    profiles: {
      full_name: string | null;
      company_logo_path: string | null;
      employer_verified: boolean | null;
    } | null;
  } | null;
};

export function useApplications() {
  const [applications, setApplications] = useState<ApplicationWithJob[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApplications();
  }, []);

  async function loadApplications() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("applications")
      .select(
        `
        id,
        status,
        created_at,
        jobs (
          id,
          title,
          location,
          pay,
          description,
          user_id,
          profiles (
            full_name,
            company_logo_path,
            employer_verified
          )
        )
      `
      )
      .eq("worker_id", user.id)
      .order("created_at", { ascending: false });

    if (data) setApplications(data as unknown as ApplicationWithJob[]);

    const { data: reviewsData } = await supabase
      .from("reviews")
      .select("application_id")
      .eq("reviewer_id", user.id);

    if (reviewsData) {
      setReviewedIds(new Set(reviewsData.map((r) => r.application_id)));
    }

    setLoading(false);
  }

  return { applications, reviewedIds, loading, refresh: loadApplications };
}