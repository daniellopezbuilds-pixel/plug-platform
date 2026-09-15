"use client";

import { getAdPublicUrl } from "@/lib/ads";
import type { ActiveAd } from "@/hooks/useActiveAd";
import { AdRotationDots } from "@/components/ads/AdRotationDots";
import { recordAdClick } from "@/lib/adEvents";

export function AdBanner({
  ad,
  index = 0,
  total = 1,
  onSelect,
}: {
  ad: ActiveAd;
  /** 0-based index of this ad within the slot's rotation. */
  index?: number;
  total?: number;
  onSelect?: (index: number) => void;
}) {
  const imageUrl = getAdPublicUrl(ad.image_path);

  const content = (
    <div
      className="relative w-full max-w-[728px] rounded-lg border border-zinc-800 overflow-hidden bg-black"
      style={{ paddingTop: "min(25%, 182px)" }}
    >
      <img
        src={imageUrl}
        alt={ad.title}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  );

  return (
    <div className="mb-8 max-w-[728px]">
      {ad.link_url ? (
        // Instrumented even though nothing currently renders AdBanner — no page
        // imports it; SponsoredRail/FeedAdCard is the only live slot. Leaving
        // it out would mean the day it comes back, its clicks silently do not
        // count.
        <a
          href={ad.link_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordAdClick(ad.id)}
        >
          {content}
        </a>
      ) : (
        content
      )}
      {/* Outside the anchor so the disclosure isn't itself a click target. */}
      <div className="mt-1.5 flex items-center gap-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Sponsored
        </span>
        {onSelect && (
          <AdRotationDots index={index} total={total} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}