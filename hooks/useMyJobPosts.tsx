"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type MyJobPost = {
  id: string;
  title: string;
  location: string | null;
  created_at: string;
  applicants: number;
  /** Applications still pending — the ones waiting on this employer. */
  waiting: number;
};

/**
 * The signed-in employer's job posts with applicant counts per job.
 *
 * Two queries, not an aggregate embed per job: the jobs, then every
 * application to them with just job_id and status, counted here. An
 * employer's applications are dozens of rows, and this keeps "waiting" (still
 * pending) separate from the total without depending on filtered-aggregate
 * support in PostgREST.
 *
 * Borrowed from Indeed's employer dashboard, where the job list with an
 * applicant count beside each title is the first thing you see — because
 * that is how an employer thinks about hiring: job by job.
 *
 * `refreshKey`: recount when it changes. Applicants passes its decisions, so
 * the picker's "N waiting" follows an accept or decline instead of showing
 * the count from page load beside tabs that have moved on.
 */
export function useMyJobPosts(limit = 6, refreshKey: unknown = 0) {
  const [posts, setPosts] = useState<MyJobPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: jobs } = await supabase
        .from("jobs")
        .select("id, title, location, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      const rows = (jobs as Omit<MyJobPost, "applicants" | "waiting">[]) ?? [];
      const ids = rows.map((j) => j.id);

      const counts = new Map<string, { applicants: number; waiting: number }>();
      if (ids.length > 0) {
        const { data: apps } = await supabase
          .from("applications")
          .select("job_id, status")
          .in("job_id", ids);

        for (const app of (apps as { job_id: string; status: string | null }[]) ?? []) {
          const c = counts.get(app.job_id) ?? { applicants: 0, waiting: 0 };
          c.applicants++;
          if (!app.status || app.status === "pending") c.waiting++;
          counts.set(app.job_id, c);
        }
      }

      if (cancelled) return;
      setPosts(
        rows.map((j) => ({ ...j, ...(counts.get(j.id) ?? { applicants: 0, waiting: 0 }) }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, refreshKey]);

  return { posts, loading };
}
