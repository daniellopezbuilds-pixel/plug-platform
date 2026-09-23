"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The badges on the sidebar, live.
 *
 * SAME SHAPE AS useAdminCounts: count queries rather than array lengths, one
 * realtime channel, a debounce, and a recount on any event rather than
 * patching a number from the payload. The reasoning is the same — the queries
 * below ARE the definitions of these counts, and deriving them from a change
 * payload would be a second copy that could disagree.
 *
 * TWO OF THESE ARE "UNREAD", ONE IS NOT, AND THAT IS WORTH KNOWING.
 *
 *   applications  unread `status_change` notifications — your application was
 *                 accepted or rejected. Clears when you read it.
 *   applicants    unread `new_applicant` notifications — somebody applied to
 *                 your job. Clears when you read it.
 *   requests      pending requests, which is NOT an unread count. Nothing in
 *                 the schema emits a notification when a request of yours is
 *                 decided, so there is no "unread" to count. What this answers
 *                 instead is "how many things of mine are waiting on somebody
 *                 else", which is the true and useful number available — but it
 *                 is a standing badge, not one that clears on a glance.
 *
 * WHY NOT MESSAGES TOO. useUnreadMessagesCount already does that, with its own
 * subscription and a genuinely different definition — it compares each
 * conversation's last message against last_read_at rather than counting
 * notification rows. Folding it in here would mean rewriting a working count
 * to be less accurate.
 *
 * Every table subscribed below is in the supabase_realtime publication:
 * notifications from 20260922200000, the other four from 20260922160000.
 * Without that a subscription succeeds and silently never fires.
 */

export type SidebarCounts = {
  applications: number;
  applicants: number;
  requests: number;
};

const ZERO: SidebarCounts = { applications: 0, applicants: 0, requests: 0 };

export function useSidebarCounts() {
  const [counts, setCounts] = useState<SidebarCounts>(ZERO);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;

    const head = { count: "exact" as const, head: true };

    const [statusChange, newApplicant, ads, general, employerDocs, unionCheck] =
      await Promise.all([
        supabase
          .from("notifications")
          .select("id", head)
          .eq("user_id", userId)
          .eq("type", "status_change")
          .eq("read", false),

        supabase
          .from("notifications")
          .select("id", head)
          .eq("user_id", userId)
          .eq("type", "new_applicant")
          .eq("read", false),

        // The four things /dashboard/requests lists, filtered to the ones
        // still waiting on somebody. Mirrors useMyRequests.
        supabase
          .from("sponsored_listings")
          .select("id", head)
          .eq("submitted_by", userId)
          .eq("status", "pending"),

        supabase
          .from("general_requests")
          .select("id", head)
          .eq("submitted_by", userId)
          .eq("status", "pending"),

        // An uploaded document with the account still unverified is a pending
        // employer verification.
        supabase
          .from("employer_documents")
          .select("id, profiles!employer_documents_user_id_fkey!inner(employer_verified)", head)
          .eq("user_id", userId)
          .eq("profiles.employer_verified", false),

        // A self-reported union status not yet confirmed. One row at most.
        supabase
          .from("profiles")
          .select("id", head)
          .eq("id", userId)
          .eq("union_verified", false)
          .not("union_status", "is", null),
      ]);

    // A failed count resolves to 0 rather than holding the previous number: a
    // badge that quietly keeps showing a stale figure is worse than one that
    // disappears.
    const n = (r: { count: number | null; error: unknown }) =>
      r.error ? 0 : r.count ?? 0;

    setCounts({
      applications: n(statusChange),
      applicants: n(newApplicant),
      requests: n(ads) + n(general) + n(employerDocs) + n(unionCheck),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      userIdRef.current = user.id;
      await load();

      if (cancelled) return;

      const schedule = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(load, 400);
      };

      channel = supabase
        .channel(`sidebar-counts-${user.id}-${Date.now()}`)
        // Filtered to this user: the badge only ever reflects their own rows,
        // and RLS would withhold anyone else's anyway. The filter saves the
        // client being woken for every notification on the platform.
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          schedule
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sponsored_listings" },
          schedule
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "general_requests" },
          schedule
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "employer_documents" },
          schedule
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${user.id}`,
          },
          schedule
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  return counts;
}
