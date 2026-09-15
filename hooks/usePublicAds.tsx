"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { recordAdImpression } from "@/lib/adEvents";

export type PublicAd = {
  id: string;
  title: string;
  image_path: string;
  link_url: string | null;
};

/** How long each ad holds the slot before the next one takes over. */
const ROTATE_MS = 8000;

/**
 * The ads eligible for one placement, plus the single one currently holding
 * that placement's slot.
 *
 * Callers render `ad`, never `ads` — each surface has exactly one slot. The
 * starting ad is random per page load, then rotation walks the list in order
 * and loops. Both happen here rather than in the pages so the three surfaces
 * cannot drift apart, and both run inside effects so they are client-only:
 * randomising during render would differ between the server pass and
 * hydration.
 *
 * `adIndex` / `adCount` drive the "1 of 3 sponsored" disclosure.
 */
export function usePublicAds(placement: "jobs_board" | "marketplace" | "feed") {
  const [ads, setAds] = useState<PublicAd[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  /**
   * Jump to one ad and stop auto-rotating. Deliberately one-way: someone who
   * clicked a dot has chosen what they want to look at, and having the slot
   * move again underneath them a few seconds later would undo that.
   * Re-mounting the page clears it.
   */
  function selectAd(next: number) {
    setIndex(next);
    setPaused(true);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);

      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("sponsored_listings")
        .select("id, title, image_path, link_url, start_date, end_date")
        .eq("placement", placement)
        .eq("is_active", true)
        .eq("status", "approved")
        // An unpaid campaign never renders. Belt and braces: a row whose
        // checkout was abandoned is already is_active false and status
        // 'pending', so it fails the two filters above as well. This one is
        // here so the rule survives someone approving a row by hand in the SQL
        // editor without noticing it was never paid for.
        .neq("payment_status", "unpaid")
        .order("created_at", { ascending: false });

      if (error || !data) {
        setAds([]);
        setIndex(0);
        setLoading(false);
        return;
      }

      // A null bound means "no bound" — such an ad runs indefinitely.
      const eligible = data.filter((ad) => {
        const startsOk = !ad.start_date || ad.start_date <= today;
        const endsOk = !ad.end_date || ad.end_date >= today;
        return startsOk && endsOk;
      });

      setAds(eligible);
      setIndex(
        eligible.length > 0 ? Math.floor(Math.random() * eligible.length) : 0
      );
      setPaused(false);
      setLoading(false);
    }

    load();
  }, [placement]);

  // Tracked in state, and subscribed to, so turning the OS setting on stops
  // rotation without needing a reload.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    // Nothing to rotate between, the viewer asked for no motion, or they
    // picked an ad by hand — in each case they keep the current ad rather
    // than losing the slot.
    if (ads.length < 2 || reducedMotion || paused) return;

    const timer = setInterval(
      () => setIndex((i) => (i + 1) % ads.length),
      ROTATE_MS
    );

    return () => clearInterval(timer);
  }, [ads.length, reducedMotion, paused]);

  const currentAd = ads[index] ?? null;

  /**
   * Log an impression whenever a different ad takes the slot — the first one
   * after loading, each rotation, and each pick from the dots.
   *
   * Here rather than in SponsoredRail or the three pages, for the same reason
   * the rotation lives here: this is the one place that knows which ad is
   * currently on screen, so the surfaces cannot drift apart in what they count.
   *
   * The ref makes this fire on CHANGE rather than on render. Two things would
   * otherwise double-count: any re-render of a consumer, and React Strict Mode,
   * which invokes effects twice in development. Rotation never yields the same
   * id twice in a row — with fewer than two ads there is no rotation at all —
   * so "same id as last time" only ever means a repeat, never a genuine second
   * showing.
   *
   * Capture only; nothing reads it. See lib/adEvents.tsx.
   */
  const lastLoggedAdId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentAd) return;
    if (lastLoggedAdId.current === currentAd.id) return;

    lastLoggedAdId.current = currentAd.id;
    recordAdImpression(currentAd.id);
  }, [currentAd]);

  return {
    ads,
    ad: currentAd,
    adIndex: index,
    adCount: ads.length,
    selectAd,
    loading,
  };
}
