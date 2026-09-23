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
    user_id
  )
`;

/**
 * THE EMPLOYER IS FETCHED SEPARATELY, NOT EMBEDDED.
 *
 * This used to embed `profiles` inside `jobs`, and that embed has never
 * resolved: jobs.user_id has no foreign key to profiles (on either project),
 * so PostgREST answers PGRST200 "Could not find a relationship between
 * 'jobs' and 'profiles'". usePagedList treats an error as an empty list, so
 * the page showed "No applications yet" to people with applications — made
 * visible when the status tabs started counting from a separate query that
 * did work.
 *
 * A second query by id is the fix that needs no schema change. Adding the FK
 * would also work, but it is a migration against a column that may hold
 * rows whose profile is gone.
 */
const EMPLOYER_COLUMNS = "id, full_name, company_logo_path, employer_verified, signup_type";

/** 10: applications are tall cards, and most people have far fewer. */
const PAGE_SIZE = 10;

export type ApplicationStatusFilter = "" | "pending" | "accepted" | "rejected";

export function useApplications() {
  const [userId, setUserId] = useState<string | null>(null);
  const [resolvingUser, setResolvingUser] = useState(true);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  /**
   * The status tab. Filtered in the query, not after it, so paging runs over
   * the filtered set — a change of status changes fetchPage, which
   * usePagedList treats as a new list and reloads from the first page.
   */
  const [status, setStatus] = useState<ApplicationStatusFilter>("");

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
        .eq("worker_id", userId);

      if (status) query = query.eq("status", status);
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error || !data) return { data: null, error };

      const rows = data as unknown as ApplicationWithJob[];
      const employerIds = [
        ...new Set(rows.map((r) => r.jobs?.user_id).filter((id): id is string => !!id)),
      ];

      const employers = new Map<string, NonNullable<ApplicationWithJob["jobs"]>["profiles"]>();
      if (employerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select(EMPLOYER_COLUMNS)
          .in("id", employerIds);
        for (const p of profiles ?? []) employers.set(p.id, p);
      }

      return {
        data: rows.map((r) =>
          r.jobs ? { ...r, jobs: { ...r.jobs, profiles: employers.get(r.jobs.user_id) ?? null } } : r
        ),
        error: null,
      };
    },
    [userId, status]
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
    error: paged.error,
    reload: paged.reload,
    loadingMore: paged.loadingMore,
    hasMore: paged.hasMore,
    loadMore: paged.loadMore,
    reviewedIds,
    refresh,
    status,
    setStatus,
  };

}