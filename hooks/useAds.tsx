"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Ad = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
  placement: "jobs_board" | "marketplace" | "feed";
  city: string | null;
  /** 'brand' for brand self-service submissions, 'internal' for house/job ads. */
  source: string | null;
  status: string;
  /** Admin's reason for rejection, shown back to the brand that submitted it. */
  review_notes: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  is_paid_ad: boolean;
  payment_status: string;
  amount_charged: number | null;
  submitted_by: string | null;
  created_at: string;
};

/**
 * Unfiltered — `useAds()` — is the admin ad manager and returns everything.
 *
 * @param filters.submittedBy scope to one user's own submissions. Needed even
 *   though RLS exists: an authenticated read also returns other people's
 *   approved ads, so RLS alone does not scope a brand's list to itself.
 * @param filters.source 'brand' or 'internal'.
 * @param filters.skip hold off querying entirely. Without this a caller that
 *   is still resolving its user id would run one unfiltered query first and
 *   briefly show every approved ad on the platform as if it were the user's.
 * @param filters.pageSize fetch this many rows at a time and expose
 *   `loadMore` / `hasMore` for infinite scroll. Omit to fetch everything in
 *   one go, which is what the admin ad manager wants.
 */
export function useAds(filters?: {
  submittedBy?: string | null;
  source?: string | null;
  skip?: boolean;
  pageSize?: number;
}) {
  const submittedBy = filters?.submittedBy ?? null;
  const source = filters?.source ?? null;
  const skip = filters?.skip ?? false;
  const pageSize = filters?.pageSize ?? null;

  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (offset: number) => {
      let query = supabase
        .from("sponsored_listings")
        .select("*")
        .order("created_at", { ascending: false });

      if (submittedBy) query = query.eq("submitted_by", submittedBy);
      if (source) query = query.eq("source", source);
      if (pageSize) query = query.range(offset, offset + pageSize - 1);

      return query;
    },
    [submittedBy, source, pageSize]
  );

  const load = useCallback(async () => {
    if (skip) {
      // Still waiting on the caller, not finished with nothing to show.
      setAds([]);
      setLoading(true);
      return;
    }

    setLoading(true);

    const { data, error } = await fetchPage(0);

    if (error || !data) {
      setAds([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setAds(data as Ad[]);
    // A full page back means there may be another. One extra request at the
    // end is cheaper than asking for an exact count on every load.
    setHasMore(pageSize ? data.length === pageSize : false);
    setLoading(false);
  }, [fetchPage, skip, pageSize]);

  const loadMore = useCallback(async () => {
    if (!pageSize || loadingMore || !hasMore) return;

    setLoadingMore(true);
    const { data, error } = await fetchPage(ads.length);

    if (!error && data) {
      // Filter by id: a row inserted between pages would otherwise shift the
      // window and duplicate an entry.
      setAds((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...(data as Ad[]).filter((a) => !seen.has(a.id))];
      });
      setHasMore(data.length === pageSize);
    }

    setLoadingMore(false);
  }, [fetchPage, pageSize, loadingMore, hasMore, ads.length]);

  useEffect(() => {
    load();
  }, [load]);

  async function createAd(input: {
    title: string;
    image_path: string;
    link_url: string;
    placement: "jobs_board" | "marketplace" | "feed";
    start_date?: string | null;
    end_date?: string | null;
    is_paid_ad?: boolean;
    payment_status?: string;
    amount_charged?: number | null;
  }) {
    const { error } = await supabase.from("sponsored_listings").insert({
      title: input.title,
      image_path: input.image_path,
      link_url: input.link_url || null,
      placement: input.placement,
      is_active: true,
      status: "approved",
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      is_paid_ad: input.is_paid_ad || false,
      payment_status: input.payment_status || "n/a",
      amount_charged: input.amount_charged ?? null,
    });

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  /**
   * Brand self-service submission, as opposed to createAd above which is the
   * admin path and publishes immediately.
   *
   * Always lands as status 'pending' and is_active false: a brand ad is
   * reviewed before it runs. usePublicAds filters on both, and RLS keeps
   * pending rows away from anon, so nothing here renders until an admin
   * approves it.
   */
  async function createBrandAd(input: {
    title: string;
    image_path: string;
    link_url: string;
    placement: "jobs_board" | "marketplace" | "feed";
    city: string;
    start_date: string;
    end_date: string;
    daily_budget: number;
    run_days: number;
    submitted_by: string;
  }) {
    const { error } = await supabase.from("sponsored_listings").insert({
      title: input.title,
      image_path: input.image_path,
      link_url: input.link_url || null,
      placement: input.placement,
      city: input.city,
      source: "brand",
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: false,
      status: "pending",
      is_paid_ad: true,
      payment_status: "unpaid",
      // Matches the total shown on the form, which is rounded — charging a
      // different figure to the one the brand agreed to would be worse than
      // losing the fraction.
      amount_charged: Math.round(input.daily_budget * input.run_days),
      submitted_by: input.submitted_by,
    });

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function updateAd(
    id: string,
    updates: {
      title: string;
      link_url: string;
      placement: "jobs_board" | "marketplace" | "feed";
      image_path?: string;
      start_date?: string | null;
      end_date?: string | null;
      is_paid_ad?: boolean;
      payment_status?: string;
      amount_charged?: number | null;
    }
  ) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({
        title: updates.title,
        link_url: updates.link_url || null,
        placement: updates.placement,
        start_date: updates.start_date || null,
        end_date: updates.end_date || null,
        is_paid_ad: updates.is_paid_ad ?? false,
        payment_status: updates.payment_status || "n/a",
        amount_charged: updates.amount_charged ?? null,
        ...(updates.image_path ? { image_path: updates.image_path } : {}),
      })
      .eq("id", id);

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function toggleActive(id: string, currentValue: boolean) {
    const { error } = await supabase
      .from("sponsored_listings")
      .update({ is_active: !currentValue })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setAds((prev) =>
      prev.map((ad) => (ad.id === id ? { ...ad, is_active: !currentValue } : ad))
    );
  }

  async function deleteAd(id: string) {
    const { error } = await supabase.from("sponsored_listings").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setAds((prev) => prev.filter((ad) => ad.id !== id));
  }

  return {
    ads,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    createAd,
    createBrandAd,
    updateAd,
    toggleActive,
    deleteAd,
    reload: load,
  };
}