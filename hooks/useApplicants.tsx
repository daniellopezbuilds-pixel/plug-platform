"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ApplicantWithJob = {
  id: string;
  status: string;
  created_at: string;
  worker_id: string;
  jobs: {
    id: string;
    title: string;
  } | null;
  profiles: {
    full_name: string | null;
    profile_number: string | null;
    union_status: string | null;
    union_verified: boolean | null;
    years_experience: number | null;
    resume_path: string | null;
  } | null;
};

export function useApplicants() {
  const [applicants, setApplicants] = useState<ApplicantWithJob[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadApplicants();
  }, []);

  async function loadApplicants() {
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
        worker_id,
        jobs!inner (
          id,
          title,
          user_id
        ),
        profiles (
          full_name,
          profile_number,
          union_status,
          union_verified,
          years_experience,
          resume_path
        )
      `
      )
      .eq("jobs.user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) setApplicants(data as unknown as ApplicantWithJob[]);

    const { data: reviewsData } = await supabase
      .from("reviews")
      .select("application_id")
      .eq("reviewer_id", user.id);

    if (reviewsData) {
      setReviewedIds(new Set(reviewsData.map((r) => r.application_id)));
    }

    setLoading(false);
  }

  async function updateStatus(applicationId: string, status: "accepted" | "rejected" | "pending") {
    setUpdatingId(applicationId);

    const { error } = await supabase
      .from("applications")
      .update({ status })
      .eq("id", applicationId);

    setUpdatingId(null);

    if (error) return { error: error.message };

    setApplicants((prev) =>
      prev.map((a) => (a.id === applicationId ? { ...a, status } : a))
    );

    return { error: null };
  }

  return { applicants, reviewedIds, loading, updatingId, updateStatus, refresh: loadApplicants };
}