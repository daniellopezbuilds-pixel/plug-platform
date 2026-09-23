"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";

export type Job = {
  id: string;
  user_id: string;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  created_at: string;
  required_union_status: string | null;

  /**
   * The legacy free-text rate. KEPT, not replaced: the seven jobs posted
   * before 20260922170000 have their pay only here. formatPay() in lib/jobs
   * falls back to it when there is no structured rate.
   */
  pay: string | null;

  // Added by 20260922170000. Nullable throughout, because those same seven
  // rows have none of them — see that migration's header for why the
  // requiredness lives in the form rather than in the schema.
  classification: string | null;
  work_type: string | null;
  starts_on: string | null;
  duration: string | null;
  shift: string | null;
  /**
   * numeric(10,2). Typed as number | string because that is what actually
   * comes back: supabase-js parses these to numbers, but PostgREST hands
   * numeric over as a string in other paths and a future client version is
   * free to stop parsing. formatPay() coerces either, so neither shape is a
   * bug — asserting only one of them would be.
   */
  pay_rate_min: number | string | null;
  pay_rate_max: number | string | null;
  pay_unit: string | null;
  min_years_experience: string | null;
  certification_required: string | null;
  requires_own_tools: boolean;
  requires_own_transport: boolean;
};

/**
 * What the board can be narrowed by. Empty string means "any".
 *
 * `union` has one value beyond the stored ones: "open" is a job with no union
 * requirement at all (required_union_status IS NULL), which is what a worker
 * who is neither asking "union jobs only" nor "non-union only" usually wants
 * to see set apart.
 */
export type JobFilters = {
  /** Keyword, matched against title, company and description. */
  q: string;
  classification: string;
  workType: string;
  union: "" | "union" | "non_union" | "open";
};

export const NO_JOB_FILTERS: JobFilters = { q: "", classification: "", workType: "", union: "" };

/** Filters in use, not counting the keyword — that has its own box. */
export function activeJobFilterCount(filters: JobFilters): number {
  return [filters.classification, filters.workType, filters.union].filter(Boolean).length;
}

/**
 * The keyword as a PostgREST or() term. Commas and parentheses are the
 * or() syntax itself and % and * are wildcards, so all of them are dropped
 * from what the user typed rather than escaped — nobody searches a job board
 * for a bracket.
 */
function keywordTerm(q: string): string {
  return q.replace(/[%*,()\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** 12: a screen and a half of job cards at any width. */
const PAGE_SIZE = 12;

export function useJobs() {
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobFilters>(NO_JOB_FILTERS);

  /**
   * WHICH JOBS YOU HAVE APPLIED TO IS FETCHED WHOLE, AND SHOULD BE.
   *
   * It is one row per application by this user, id only, and it decides
   * whether each card says "Apply" or "Applied". Paging it alongside the jobs
   * would mean a job on page 3 whose application is on page 1 of the other
   * list renders as un-applied — a wrong button, not a missing row. It stays a
   * complete set because it is used as a lookup, not as a list.
   */
  useEffect(() => {
    loadApplied();
  }, []);

  async function loadApplied() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("applications")
      .select("job_id")
      .eq("worker_id", user.id);

    if (data) setAppliedJobIds(new Set(data.map((a) => a.job_id)));
  }

  /**
   * FILTERED IN THE QUERY, NOT AFTER IT. The board pages, so filtering the
   * loaded rows would filter twelve jobs and call it the board. A change of
   * filter changes fetchPage, which usePagedList treats as a new list and
   * reloads from the first page — same mechanism as the directory filters.
   *
   * A legacy job with no classification or work type does not match a filter
   * on either, which is correct: it cannot be said to be that kind of job.
   */
  const { classification, workType, union } = filters;
  const term = keywordTerm(filters.q);

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase.from("jobs").select("*");

      if (term) {
        query = query.or(
          `title.ilike.%${term}%,company.ilike.%${term}%,description.ilike.%${term}%`
        );
      }
      if (classification) query = query.eq("classification", classification);
      if (workType) query = query.eq("work_type", workType);
      if (union === "open") query = query.is("required_union_status", null);
      else if (union) query = query.eq("required_union_status", union);

      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as Job[]) ?? null, error };
    },
    [term, classification, workType, union]
  );

  const paged = usePagedList<Job>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (j) => j.id,
  });

  async function applyToJob(jobId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Please log in first." };

    setApplyingId(jobId);

    const { error } = await supabase
      .from("applications")
      .insert([{ job_id: jobId, worker_id: user.id }]);

    setApplyingId(null);

    if (error) {
      if (error.code === "23505") {
        setAppliedJobIds((prev) => new Set(prev).add(jobId));
        return { error: "You already applied to this job." };
      }
      return { error: error.message };
    }

    setAppliedJobIds((prev) => new Set(prev).add(jobId));
    return { error: null };
  }

  async function refresh() {
    await Promise.all([paged.reload(), loadApplied()]);
  }

  return {
    jobs: paged.items,
    loading: paged.loading,
    error: paged.error,
    reload: paged.reload,
    loadingMore: paged.loadingMore,
    hasMore: paged.hasMore,
    loadMore: paged.loadMore,
    appliedJobIds,
    applyingId,
    applyToJob,
    refresh,
    filters,
    setFilters,
  };
}
