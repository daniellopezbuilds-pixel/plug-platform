"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";

export type ApplicationWithJob = {
  id: string;
  status: string;
  created_at: string;
  jobs: {
    id: string;
    title: string;
    location: string | null;
    /**
     * The legacy free-text rate, and the structured one added by
     * 20260922170000. BOTH, because formatPay() prefers the numbers and falls
     * back to the string — an application to a job posted before the columns
     * existed still shows its rate.
     */
    pay: string | null;
    pay_rate_min: number | string | null;
    pay_rate_max: number | string | null;
    pay_unit: string | null;
    description: string | null;
    user_id: string;
    profiles: {
      full_name: string | null;
      company_logo_path: string | null;
      employer_verified: boolean | null;
      signup_type: string | null;
    } | null;
  } | null;
};

const COLUMNS = `
  id,
  status,
  created_at,
  jobs (
    id,
    title,
    location,
    pay,
    pay_rate_min,
    pay_rate_max,
    pay_unit,
    description,
    user_id,
    profiles (
      full_name,
      company_logo_path,
      employer_verified,
      signup_type
    )
  )
`;

/** 10: applications are tall cards, and most people have far fewer. */
const PAGE_SIZE = 10;

export function useApplications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [resolvingUser, setResolvingUser] = useState(true);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setResolvingUser(false);
    });
  }, []);

  /**
   * Which applications this user has already reviewed. A complete set on
   * purpose, for the same reason as appliedJobIds in useJobs: it is a lookup
   * behind a button, and paging it would make a reviewed application on a
   * later page offer its review form again.
   */
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
        .eq("worker_id", userId)
        .order("created_at", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as unknown as ApplicationWithJob[]) ?? null, error };
    },
    [userId]
  );

  const paged = usePagedList<ApplicationWithJob>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (a) => a.id,
    skip: resolvingUser,
  });

  async function refresh() {
    await Promise.all([paged.reload(), loadReviewed()]);
  }

  return {
    applications: paged.items,
    loading: paged.loading,
    loadingMore: paged.loadingMore,
    hasMore: paged.hasMore,
    loadMore: paged.loadMore,
    reviewedIds,
    refresh,
  };

}