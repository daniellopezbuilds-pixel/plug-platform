"use client";

import { getAdPublicUrl } from "@/lib/ads";
import type { ActiveAd } from "@/hooks/useActiveAd";

export function AdBanner({ ad }: { ad: ActiveAd }) {
  const imageUrl = getAdPublicUrl(ad.image_path);

  const content = (
    <img
      src={imageUrl}
      alt={ad.title}
      className="w-full h-32 rounded-lg object-cover border border-zinc-800"
    />
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