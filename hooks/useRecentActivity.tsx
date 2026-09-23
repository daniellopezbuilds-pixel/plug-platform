"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Mode } from "@/lib/accountModes";

/**
 * Real activity for the dashboard's Recent Activity card.
 *
 * This card used to be three hardcoded bullets — "Welcome to Sparx Plug",
 * "Complete your profile", "Browse available jobs near you" — identical for
 * every account no matter what had happened on it. That is worse than an empty
 * state: an empty state tells the truth.
 *
 * WHAT COUNTS AS ACTIVITY depends on which side you are on, so the two modes
 * ask different questions:
 *
 *   employer   someone applied to one of my jobs; someone asked to connect
 *   worker     I applied to a job; someone asked to connect
 *
 * WHAT IS NOT HERE, and why. Status changes — "your application was accepted" —
 * would be the most useful line on this card for a worker, and there is nowhere
 * to read them from: applications.status is overwritten in place with no
 * history and no updated_at, so the moment of the change is not recorded. That
 * needs a column or an events table before it can be shown. The notifications
 * table exists and would be the natural source once something writes to it for
 * these events; today nothing does.
 */

export type ActivityItem = {
  id: string;
  text: string;
  href: string;
  at: string | null;
};

const LIMIT = 5;

export function useRecentActivity(mode: Mode) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const collected: ActivityItem[] = [];

      if (mode === "employer") {
        const { data: applications } = await supabase
          .from("applications")
          .select(
            "id, status, created_at, jobs!inner(title, user_id), profiles!applications_worker_id_fkey(full_name)"
          )
          .eq("jobs.user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(LIMIT);

        for (const row of (applications ?? []) as never[]) {
          const a = row as {
            id: string;
            status: string | null;
            created_at: string;
            jobs: { title: string | null } | null;
            profiles: { full_name: string | null } | null;
          };

          const who = a.profiles?.full_name || "Someone";
          const what = a.jobs?.title || "one of your jobs";

          collected.push({
            id: `application-${a.id}`,
            text:
              a.status === "accepted"
                ? `You hired ${who} for ${what}`
                : `${who} applied to ${what}`,
            href: "/dashboard/applicants",
            at: a.created_at,
          });
        }
      } else {
        const { data: applications } = await supabase
          .from("applications")
          .select("id, status, created_at, jobs(title)")
          .eq("worker_id", user.id)
          .order("created_at", { ascending: false })
          .limit(LIMIT);

        for (const row of (applications ?? []) as never[]) {
          const a = row as {
            id: string;
            status: string | null;
            created_at: string;
            jobs: { title: string | null } | null;
          };

          const what = a.jobs?.title || "a job";

          collected.push({
            id: `application-${a.id}`,
            // The status is current, not a change event — "accepted" here means
            // it is accepted now, not that it happened at created_at. Worded to
            // avoid implying the timestamp belongs to the decision.
            text:
              a.status === "accepted"
                ? `You were hired for ${what}`
                : a.status === "rejected"
                ? `Your application to ${what} was not successful`
                : `You applied to ${what}`,
            href: "/dashboard/applications",
            at: a.created_at,
          });
        }
      }

      // Connection requests you have received, both modes. Pending ones are
      // the interesting case — they are waiting on the reader.
      const { data: connections } = await supabase
        .from("connections")
        .select(
          "id, status, created_at, requester:profiles!connections_requester_id_fkey(full_name)"
        )
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(LIMIT);

      for (const row of (connections ?? []) as never[]) {
        const c = row as {
          id: string;
          status: string | null;
          created_at: string | null;
          requester: { full_name: string | null } | null;
        };

        const who = c.requester?.full_name || "Someone";

        collected.push({
          id: `connection-${c.id}`,
          text:
            c.status === "pending"
              ? `${who} wants to connect`
              : `You connected with ${who}`,
          href: "/dashboard/marketplace",
          at: c.created_at,
        });
      }

      if (cancelled) return;

      collected.sort((a, b) => {
        // Nulls last: connections.created_at is nullable in the schema.
        if (!a.at) return 1;
        if (!b.at) return -1;
        return new Date(b.at).getTime() - new Date(a.at).getTime();
      });

      setItems(collected.slice(0, LIMIT));
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  return { items, loading };
}
