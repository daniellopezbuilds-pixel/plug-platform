"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * How much work is waiting in each admin queue, live.
 *
 * WHY THIS IS NOT `pending.length`. The tab badges used to count the arrays
 * the queue hooks had already fetched, which worked only because those hooks
 * fetched every pending row with no limit. Now that they page, the array is
 * one page and its length is not the answer — a badge reading "10" beside a
 * queue of forty is worse than no badge. So the counts are their own queries:
 * `count: "exact", head: true` returns the number and no rows.
 *
 * FIVE HEAD REQUESTS, NOT FIVE TABLE SCANS OF ROWS. Each is a COUNT over the
 * same indexed predicate the queue itself filters on, and none of them
 * transfers a row. They run once on mount and again when something changes.
 *
 * LIVE, VIA ONE CHANNEL. Every queue table is subscribed on a single realtime
 * channel and any event on any of them re-runs all five counts. Recounting
 * everything rather than adjusting one number from the payload is deliberate:
 * an INSERT into sponsored_listings is only a new Advertisement Request if its
 * status is 'pending', a badge UPDATE can move a row into or out of the queue
 * depending on the direction, and reimplementing each of those rules against a
 * change payload would be a second copy of the queue definitions that could
 * disagree with the first. The queries below ARE the definitions.
 *
 * The tables must be in the supabase_realtime publication or the subscription
 * succeeds and never fires — see 20260922160000_realtime_admin_queues.sql.
 *
 * DEBOUNCED, because an approval writes to two tables in quick succession and
 * would otherwise trigger two full recounts for one action.
 */

export type AdminCounts = {
  employers: number;
  union: number;
  /** Every pending ad request. What the All Requests tab lists. */
  adRequests: number;
  /**
   * The brand-submitted subset, which is what the Advertisement Requests tab
   * lists — the admin page filters `source === "brand"` out of the same
   * pending set. A SUBSET OF adRequests, so it is deliberately left out of
   * the total below rather than added to it.
   */
  brandAdRequests: number;
  badges: number;
  generalRequests: number;
  /**
   * Distinct items waiting, for the summary beside the heading.
   *
   * Not the sum of the tab badges. All Requests already aggregates four of the
   * five queues, and brandAdRequests is a slice of adRequests — adding the
   * badges together would count most of the work two or three times and
   * produce a headline number that is simply wrong.
   */
  total: number;
};

const ZERO: AdminCounts = {
  employers: 0,
  union: 0,
  adRequests: 0,
  brandAdRequests: 0,
  badges: 0,
  generalRequests: 0,
  total: 0,
};

/** Tables whose changes can move any of the numbers above. */
const WATCHED = [
  "employer_documents",
  "profiles",
  "sponsored_listings",
  "user_badges",
  "general_requests",
] as const;

export function useAdminCounts(enabled: boolean) {
  const [counts, setCounts] = useState<AdminCounts>(ZERO);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    // head: true asks PostgREST for the count in a header and no body.
    const head = { count: "exact" as const, head: true };

    const [
      employers,
      union,
      adRequests,
      brandAdRequests,
      badges,
      generalRequests,
    ] = await Promise.all([
        // Mirrors useEmployerVerifications: a document whose owner is not yet
        // verified. !inner so the profiles filter actually restricts the join.
        supabase
          .from("employer_documents")
          .select("id, profiles!employer_documents_user_id_fkey!inner(employer_verified)", head)
          .eq("profiles.employer_verified", false),

        supabase
          .from("profiles")
          .select("id", head)
          .eq("union_verified", false)
          .not("union_status", "is", null),

        // Mirrors useAdRequests, INCLUDING the unpaid exclusion. A brand that
        // starts checkout and closes the tab leaves a pending row that never
        // reaches review; counting it would send an admin to a tab to look
        // for work that is not there.
        supabase
          .from("sponsored_listings")
          .select("id", head)
          .eq("status", "pending")
          .neq("payment_status", "unpaid"),

        // The Advertisement Requests tab shows brand submissions only.
        supabase
          .from("sponsored_listings")
          .select("id", head)
          .eq("status", "pending")
          .neq("payment_status", "unpaid")
          .eq("source", "brand"),

        // Mirrors useBadgeRequests: license_verified only. user_badges also
        // holds early_member and business_verified, and a pending row of
        // either is not a licence review.
        supabase
          .from("user_badges")
          .select("id", head)
          .eq("badge_key", "license_verified")
          .eq("status", "pending"),

        supabase
          .from("general_requests")
          .select("id", head)
          .eq("status", "pending"),
      ]);

    // A failed count resolves to 0 rather than holding the previous number.
    // A badge that silently keeps showing a stale figure is the failure this
    // hook exists to avoid; zero at least matches "nothing to show".
    const n = (r: { count: number | null; error: unknown }) =>
      r.error ? 0 : r.count ?? 0;

    const next = {
      employers: n(employers),
      union: n(union),
      adRequests: n(adRequests),
      brandAdRequests: n(brandAdRequests),
      badges: n(badges),
      generalRequests: n(generalRequests),
    };

    setCounts({
      ...next,
      // brandAdRequests omitted: it is a subset of adRequests.
      total:
        next.employers +
        next.union +
        next.adRequests +
        next.badges +
        next.generalRequests,
    });
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    load();

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(load, 400);
    };

    let channel = supabase.channel(`admin-counts-${Date.now()}`);

    for (const table of WATCHED) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule
      );
    }

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  return { counts, loading, refresh: load };
}
