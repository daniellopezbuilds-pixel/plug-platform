"use client";

import { usePublicAds } from "@/hooks/usePublicAds";
import { FeedAdCard } from "@/components/ads/FeedAdCard";

/** Matches the reserved width in PageWithRail. */
const RAIL_WIDTH = 320;

/**
 * The sponsored slot, in the right rail, identical on every page that has one.
 *
 * Owns its own `usePublicAds` call, so the three surfaces cannot drift apart —
 * previously feed, jobs and marketplace each wired up the hook, the index, the
 * rotation callback and the placement themselves, and the feed additionally
 * injected a second copy of the same ad into the post stream.
 *
 * NO LAYOUT SHIFT. The image box inside FeedAdCard reserves its own height
 * from the 4:1 aspect ratio, so the image loading moves nothing. The remaining
 * shift would be the gap between "still querying" and "ad arrived", which the
 * skeleton below covers by occupying the same box while `loading` is true.
 *
 * When a placement genuinely has no eligible ad, the rail renders nothing and
 * collapses. On desktop that changes no layout at all — PageWithRail reserves
 * the rail's width whether or not anything is in it — and on stacked narrow
 * layouts it settles once per page load rather than jumping under the user.
 */
export function SponsoredRail({
  placement,
}: {
  placement: "jobs_board" | "marketplace" | "feed";
}) {
  const { ad, adIndex, adCount, selectAd, loading } = usePublicAds(placement);

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
    <FeedAdCard
      ad={ad}
      index={adIndex}
      total={adCount}
      onSelect={selectAd}
    />
  );
}
