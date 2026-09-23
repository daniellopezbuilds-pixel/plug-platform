"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ApplicationCounts = {
  pending: number;
  accepted: number;
  rejected: number;
  total: number;
};

/**
 * How the signed-in worker's applications stand, for a summary card.
 *
 * One query for the statuses only, counted here. A person's applications are
 * a few dozen rows at most, so three separate head-count requests would cost
 * more round trips than the rows they save.
 *
 * `refreshKey` lets the Jobs Board recount after an apply, so the card agrees
 * with the button that just changed to Applied.
 */
export function useMyApplicationCounts(refreshKey: unknown = 0) {
  const [counts, setCounts] = useState<ApplicationCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("applications")
        .select("status")
        .eq("worker_id", user.id);

      if (cancelled) return;

      const rows = (data as { status: string | null }[]) ?? [];
      const next: ApplicationCounts = { pending: 0, accepted: 0, rejected: 0, total: rows.length };
      for (const { status } of rows) {
        if (status === "accepted") next.accepted++;
        else if (status === "rejected") next.rejected++;
        else next.pending++;
      }
      setCounts(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return counts;
}
