"use client";

import { getAdPublicUrl } from "@/lib/ads";
import type { PublicAd } from "@/hooks/usePublicAds";
import { AdRotationDots } from "@/components/ads/AdRotationDots";
import { recordAdClick } from "@/lib/adEvents";

export function FeedAdCard({
  ad,
  index = 0,
  total = 1,
  onSelect,
}: {
  ad: PublicAd;
  /** 0-based index of this ad within the slot's rotation. */
  index?: number;
  total?: number;
  onSelect?: (index: number) => void;
}) {
  const imageUrl = getAdPublicUrl(ad.image_path);

  const content = (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition">
      <div
        className="relative w-full max-w-[728px] bg-black"
        style={{ paddingTop: "min(25%, 182px)" }}
      >
        <img
          src={imageUrl}
          alt={ad.title}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
      <div className="p-4">
        <h4 className="text-white font-semibold">{ad.title}</h4>
      </div>
    </div>
  );

  return (
    <div className="max-w-[728px]">
      {ad.link_url ? (
        // onClick, not onAuxClick or a navigation interceptor: the link opens
        // in a new tab, so nothing is cancelled and nothing needs delaying.
        // recordAdClick flushes immediately rather than batching. Capture only
        // — see lib/adEvents.tsx.
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
      {/* Below the card and outside the anchor: the disclosure shouldn't be a
          click target, and a dot inside the link would navigate instead of
          switching ads. */}
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