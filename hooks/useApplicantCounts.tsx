"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ApplicantCounts = { all: number; pending: number; accepted: number; rejected: number };

/**
 * Applicant counts by status for the employer's jobs, or for one of them —
 * the numbers on the Applicants status tabs.
 *
 * Statuses only, counted here: an employer's applications are dozens of
 * rows. `refreshKey` lets the page recount after an accept or decline so the
 * tab numbers move with the decision.
 */
export function useApplicantCounts(jobId: string, refreshKey: unknown = 0, enabled = true) {
  const [counts, setCounts] = useState<ApplicantCounts | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      let query = supabase
        .from("applications")
        .select("status, jobs!inner(user_id)")
        .eq("jobs.user_id", user.id);
      if (jobId) query = query.eq("job_id", jobId);

      const { data } = await query;
      if (cancelled) return;

      const next: ApplicantCounts = { all: 0, pending: 0, accepted: 0, rejected: 0 };
      for (const row of (data as { status: string | null }[]) ?? []) {
        next.all++;
        if (row.status === "accepted") next.accepted++;
        else if (row.status === "rejected") next.rejected++;
        else next.pending++;
      }
      setCounts(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, refreshKey, enabled]);

  return counts;
}
