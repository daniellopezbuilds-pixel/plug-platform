"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";

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
    years_experience: string | null;
    resume_path: string | null;
    signup_type: string | null;
    // Added so an employer can judge an applicant without leaving the page.
    // classification is a profiles column since 20260922190000 precisely
    // because of this card — it used to live in role_credentials, which is
    // owner-and-admin only and therefore unreadable here.
    trade: string | null;
    classification: string | null;
    location: string | null;
    bio: string | null;
    company_logo_path: string | null;
  } | null;
};

const COLUMNS = `
  id,
  status,
  created_at,
  worker_id,
  jobs!inner (
    id,
    title,
    user_id
  ),
  profiles!applications_worker_id_fkey (
    full_name,
    profile_number,
    union_status,
    union_verified,
    years_experience,
    resume_path,
    signup_type,
    trade,
    classification,
    location,
    bio,
    company_logo_path
  )
`;

/** 10: applicant cards carry a resume link and a decision, so they are tall. */
const PAGE_SIZE = 10;

export function useApplicants() {
  const [userId, setUserId] = useState<string | null>(null);
  const [resolvingUser, setResolvingUser] = useState(true);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  /**
   * Which job, and which status. Both are applied in the query so paging
   * runs over the filtered set; changing either changes fetchPage, which
   * usePagedList treats as a new list. Applicant trackers work job by job
   * because that is how an employer reviews — one role at a time.
   */
  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<"" | "pending" | "accepted" | "rejected">("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setResolvingUser(false);
    });
  }, []);

  /** Complete, not paged — a lookup behind the review button. See useJobs. */
  const loadReviewed = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("reviews")
      .select("application_id")
      .eq("reviewer_id", userId);

    if (data) setReviewedIds(new Set(data.map((r) => r.application_id)));
  }, [userId]);

  useEffect(() => {
    loadReviewed();
  }, [loadReviewed]);

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      if (!userId) return { data: [], error: null };

      let query = supabase
        .from("applications")
        .select(COLUMNS)
        .eq("jobs.user_id", userId);

      if (jobId) query = query.eq("job_id", jobId);
      if (status) query = query.eq("status", status);
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as unknown as ApplicantWithJob[]) ?? null, error };
    },
    [userId, jobId, status]
  );

  const {
    items: applicants,
    setItems: setApplicants,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload,
    error,
  } = usePagedList<ApplicantWithJob>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (a) => a.id,
    skip: resolvingUser,
  });

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

  async function refresh() {
    await Promise.all([reload(), loadReviewed()]);
  }

  return {
    applicants,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reviewedIds,
    updatingId,
    updateStatus,
    refresh,
    error,
    reload,
    jobId,
    setJobId,
    status,
    setStatus,
  };
}