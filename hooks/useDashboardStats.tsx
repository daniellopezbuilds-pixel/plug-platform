"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Mode } from "@/lib/accountModes";

/**
 * The four numbers on the dashboard stat cards.
 *
 * These were literal zeros in WorkerDashboard and EmployerDashboard — every
 * account saw 0 / 0 / 0 / 0 however much activity it had. This queries them.
 *
 * COUNT-ONLY QUERIES. Every one is `head: true` with `count: "exact"`, so
 * Postgres returns a number and no rows. The dashboard never needs the records,
 * and pulling them to call `.length` would grow with the table.
 *
 * `null` UNTIL LOADED, NOT 0. A zero that means "still counting" is
 * indistinguishable from a zero that means "you have none", and the first one
 * is what made this worth fixing. Callers render a dash while the value is
 * null.
 */

export type WorkerStats = {
  /** Jobs matching the profile's location, or all jobs if it has none. */
  nearbyJobs: number | null;
  /** Whether nearbyJobs is actually filtered by location — drives the label. */
  isLocationFiltered: boolean;
  applications: number | null;
};

export type EmployerStats = {
  activeJobs: number | null;
  applicants: number | null;
  hires: number | null;
  connections: number | null;
};

/**
 * The part of a free-text location worth matching on.
 *
 * profiles.location and jobs.location are both free text, entered by hand:
 * "Van Nuys, Los Angeles, CA" and "Koreatown, Los Angeles, CA". Matching the
 * whole string finds nothing, and matching the first part ("Van Nuys") finds
 * only an exact neighbourhood.
 *
 * So take the last two comma-separated parts — "Los Angeles, CA" — which is
 * the city and state for a three-part address and the whole thing for a
 * two-part one. That is a crude proximity and it is worth being honest about:
 * it will miss a neighbouring city and it depends on people typing their
 * location in a recognisable shape. It is not a radius search and there is no
 * geocoding anywhere in this project.
 *
 * Returns null when there is nothing usable, and the caller then counts every
 * open job and says so in the label rather than showing a filtered zero.
 */
function regionToken(location: string | null | undefined): string | null {
  if (!location) return null;

  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  return parts.slice(-2).join(", ");
}

export function useDashboardStats(mode: Mode) {
  const [worker, setWorker] = useState<WorkerStats>({
    nearbyJobs: null,
    isLocationFiltered: false,
    applications: null,
  });

  const [employer, setEmployer] = useState<EmployerStats>({
    activeJobs: null,
    applicants: null,
    hires: null,
    connections: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      if (mode === "employer") {
        const [jobs, applicants, hires, connections] = await Promise.all([
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),

          // !inner so the filter on the joined table actually restricts the
          // count — the same shape useProfileStats uses for "people hired".
          supabase
            .from("applications")
            .select("id, jobs!inner(user_id)", { count: "exact", head: true })
            .eq("jobs.user_id", user.id),

          supabase
            .from("applications")
            .select("id, jobs!inner(user_id)", { count: "exact", head: true })
            .eq("jobs.user_id", user.id)
            .eq("status", "accepted"),

          // Either direction counts: a connection you accepted is as much
          // yours as one you asked for.
          supabase
            .from("connections")
            .select("id", { count: "exact", head: true })
            .eq("status", "accepted")
            .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
        ]);

        if (cancelled) return;

        setEmployer({
          activeJobs: jobs.count ?? 0,
          applicants: applicants.count ?? 0,
          hires: hires.count ?? 0,
          connections: connections.count ?? 0,
        });

        return;
      }

      // Worker mode.
      const { data: profile } = await supabase
        .from("profiles")
        .select("location")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const token = regionToken(profile?.location);

      let jobsQuery = supabase
        .from("jobs")
        .select("id", { count: "exact", head: true });

      if (token) jobsQuery = jobsQuery.ilike("location", `%${token}%`);

      const [jobs, applications] = await Promise.all([
        jobsQuery,
        supabase
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", user.id),
      ]);

      if (cancelled) return;

      setWorker({
        nearbyJobs: jobs.count ?? 0,
        isLocationFiltered: Boolean(token),
        applications: applications.count ?? 0,
      });
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  return { worker, employer };
}
