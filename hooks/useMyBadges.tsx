"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The signed-in user's badges, and the catalogue they could hold.
 *
 * Reads user_badges directly rather than public_badges, because this is the one
 * screen that should show a badge that is NOT currently valid: a pending
 * request, a rejection and its reason, an expired licence. public_badges hides
 * all three by design — it exists to answer "what does this account currently
 * hold" for other people.
 *
 * Only active badges are listed. license_verified and business_verified ship
 * inactive (see 20260916130000_badges.sql section 3), so until someone owns the
 * review queue they are absent from this screen entirely rather than shown as
 * locked — offering a badge nobody is reviewing is worse than not offering it.
 */

export type BadgeCatalogEntry = {
  key: string;
  label: string;
  description: string;
  category: string;
  icon: string | null;
  requires_review: boolean;
};

export type HeldBadge = {
  badge_key: string;
  status: string;
  awarded_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
  /**
   * Why the last automated check did not verify this badge.
   *
   * Denormalised onto user_badges precisely so this screen can read it. The
   * same value on user_badge_reviews is admin-only, because that table also
   * carries the reviewer's private notes and the other party in a claim
   * dispute. See 20260921150000_licence_notifications.sql section 1.
   */
  check_reason: string | null;
};

export function useMyBadges() {
  const [catalog, setCatalog] = useState<BadgeCatalogEntry[]>([]);
  const [held, setHeld] = useState<HeldBadge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [catalogResult, heldResult] = await Promise.all([
      supabase
        .from("badges")
        .select("key, label, description, category, icon, requires_review")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("user_badges")
        .select(
          "badge_key, status, awarded_at, expires_at, rejection_reason, check_reason"
        )
        .eq("profile_id", user.id),
    ]);

    setCatalog((catalogResult.data as BadgeCatalogEntry[]) ?? []);
    setHeld((heldResult.data as HeldBadge[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { catalog, held, loading, reload: load };
}

/**
 * Whether a held badge counts as verified right now.
 *
 * MIRRORS THE VIEW, DELIBERATELY. public_badges computes this in SQL for
 * everyone else; this is the same rule for the one screen that reads the raw
 * table. There is no stored 'expired' status — nothing writes one — so an
 * expiry in the past is what makes a verified badge stop counting, here and in
 * the view and nowhere else.
 */
export function isCurrentlyVerified(badge: HeldBadge) {
  if (badge.status !== "verified") return false;
  if (!badge.expires_at) return true;
  return new Date(badge.expires_at).getTime() > Date.now();
}
