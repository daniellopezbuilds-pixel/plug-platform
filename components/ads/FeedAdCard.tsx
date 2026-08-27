"use client";

import { getAdPublicUrl } from "@/lib/ads";
import type { PublicAd } from "@/hooks/usePublicAds";

export function FeedAdCard({ ad }: { ad: PublicAd }) {
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
      <div className="p-4 flex items-center justify-between">
        <h4 className="text-white font-semibold">{ad.title}</h4>
        <span className="text-xs text-gray-500 uppercase tracking-wide">Sponsored</span>
      </div>
    </div>
  );

  return ad.link_url ? (
    <a href={ad.link_url} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    content
  );
}