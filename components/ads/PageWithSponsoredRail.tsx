"use client";

import { usePublicAds } from "@/hooks/usePublicAds";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { PageWithRail } from "@/components/layout/PageWithRail";

/**
 * `PageWithRail` wired to the sponsored slot — what feed, jobs and marketplace
 * actually use.
 *
 * It exists because two decisions depend on the same answer and must not be
 * allowed to disagree:
 *
 *   1. what the rail renders          (SponsoredRail)
 *   2. whether the rail's 320px is reserved at all  (PageWithRail)
 *
 * Both need to know whether this placement has a live ad. Asking twice would
 * mean two identical queries per page and a window where the layout has
 * decided one thing and the slot the other, so the query is owned here, once,
 * and the answer is handed to both.
 *
 * COLLAPSE ONLY AFTER THE QUERY RESOLVES. `railCollapsed` stays false while
 * `loading` is true, so a page that does have an ad reserves the space from
 * first paint and never reflows. A placement with nothing live settles once,
 * when the query comes back empty — the content column widens, and from then
 * on there is no dead column instead of a permanent 352px of it. Collapsing
 * eagerly on `!ad` would invert that and reflow the pages that DO carry an ad,
 * which is the common case and the one worth protecting.
 */
export function PageWithSponsoredRail({
  placement,
  heading,
  children,
  measure,
  readingWidth,
  contentClassName,
}: {
  placement: "jobs_board" | "marketplace" | "feed";
  heading?: React.ReactNode;
  children: React.ReactNode;
  measure?: "reading" | "wide";
  readingWidth?: number;
  contentClassName?: string;
}) {
  const { ad, adIndex, adCount, selectAd, loading } = usePublicAds(placement);

  return (
    <PageWithRail
      heading={heading}
      measure={measure}
      readingWidth={readingWidth}
      contentClassName={contentClassName}
      railCollapsed={!loading && !ad}
      rail={
        <SponsoredRail
          ad={ad}
          index={adIndex}
          total={adCount}
          onSelect={selectAd}
          loading={loading}
        />
      }
    >
      {children}
    </PageWithRail>
  );
}
