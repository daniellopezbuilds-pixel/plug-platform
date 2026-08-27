"use client";

import { getAdPublicUrl } from "@/lib/ads";
import type { ActiveAd } from "@/hooks/useActiveAd";

export function AdBanner({ ad }: { ad: ActiveAd }) {
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
    <div className="mb-8">
      {ad.link_url ? (
        <a href={ad.link_url} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}