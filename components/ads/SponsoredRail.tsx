"use client";

import type { PublicAd } from "@/hooks/usePublicAds";
import { FeedAdCard } from "@/components/ads/FeedAdCard";

/** Matches the reserved width in PageWithRail. */
const RAIL_WIDTH = 320;

/**
 * The sponsored slot, in the right rail, identical on every page that has one.
 *
 * Presentational: it renders whatever the slot currently holds and nothing
 * else. Each page that carries a slot (feed, jobs, My Local Network) calls
 * usePublicAds once and renders this in exactly one place for the current
 * width — in the right rail from 1280px, above the content below that — so
 * the impression usePublicAds records is counted once.
 *
 * The rail no longer has to reserve or collapse space for it: rails now hold
 * other panels too (see components/layout/RailColumns.tsx), so a placement
 * with nothing live simply shows those.
 *
 * NO LAYOUT SHIFT. The image box inside FeedAdCard reserves its own height
 * from the 4:1 aspect ratio, so the image loading moves nothing. The remaining
 * shift would be the gap between "still querying" and "ad arrived", which the
 * skeleton below covers by occupying the same box while `loading` is true.
 *
 * When a placement genuinely has no eligible ad, this renders nothing.
 */
export function SponsoredRail({
  ad,
  index,
  total,
  onSelect,
  loading,
}: {
  ad: PublicAd | null;
  /** 0-based index of `ad` within the slot's rotation. */
  index: number;
  total: number;
  onSelect: (index: number) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        aria-hidden="true"
        className="rounded-lg border border-zinc-800 bg-zinc-900/40"
        // Same 4:1 box the real creative occupies, so the swap is invisible.
        style={{ paddingTop: `min(25%, ${RAIL_WIDTH / 4}px)` }}
      />
    );
  }

  if (!ad) return null;

  return (
    <FeedAdCard ad={ad} index={index} total={total} onSelect={onSelect} />
  );
}
