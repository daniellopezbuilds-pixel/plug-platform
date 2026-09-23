"use client";

import Link from "next/link";
import { RailCard, RailSkeleton } from "@/components/layout/RailCard";
import { AdStatusPill, adStateOf } from "@/components/ads/AdStatusPill";
import { Icon } from "@/components/ui/Icon";
import { useAds } from "@/hooks/useAds";
import { adPlacementLabel } from "@/lib/adPricing";
import { getAdPublicUrl } from "@/lib/ads";

/**
 * The brand's dashboard panel: where its campaigns stand.
 *
 * It used to say "campaigns are coming soon" while the brand had campaigns —
 * submissions, payments and approvals all ship. This lists the newest few
 * with their real state, so an unpaid checkout or a rejection is visible from
 * the first screen rather than only on Branding deals.
 *
 * No impressions or clicks, deliberately: analytics is cut from this phase
 * (spec section 3) and a number nobody should act on yet does not belong on
 * the first screen.
 */
export function BrandCampaignsCard({ userId }: { userId: string }) {
  const { ads, loading } = useAds({
    submittedBy: userId,
    source: "brand",
    pageSize: 5,
  });

  return (
    <RailCard
      title="Your campaigns"
      action={{ href: "/dashboard/branding-deals", label: "Manage" }}
    >
      {loading ? (
        <RailSkeleton rows={3} />
      ) : ads.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-sm text-gray-400">
            No campaigns yet. An advertisement runs on the Jobs Board, the
            feed or My Local Network once it is paid for and approved.
          </p>
          <Link
            href="/dashboard/branding-deals"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
          >
            <Icon name="plus" className="h-4 w-4" />
            New advertisement
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {ads.map((ad) => (
            <li key={ad.id}>
              <Link
                href="/dashboard/branding-deals"
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-900"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL, as everywhere else ads render */}
                <img
                  src={getAdPublicUrl(ad.image_path)}
                  alt=""
                  className="aspect-[4/1] w-24 shrink-0 rounded border border-zinc-800 object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{ad.title}</span>
                  <span className="block truncate text-xs text-gray-400">
                    {[adPlacementLabel(ad.placement), ad.start_date && `from ${ad.start_date}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <AdStatusPill state={adStateOf(ad)} fallback={ad.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}
