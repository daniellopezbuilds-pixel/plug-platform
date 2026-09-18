"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPageView } from "@/lib/pageViews";

/**
 * Logs one page view per navigation, everywhere.
 *
 * Mounted once in the root layout rather than per page, so /, /login and
 * /signup are counted alongside the dashboard — the logged-out pages are the
 * ones the visit number is mostly about, and a tracker installed per page is a
 * tracker someone forgets on the next page they add.
 *
 * usePathname AND NOT useSearchParams. Reading search params in a component
 * this high would force every page under it out of static rendering and into a
 * Suspense boundary — /, /login and /signup are all prerendered today and must
 * stay that way. It also happens to be the right call for privacy: the query
 * string is where `returnTo` and checkout state live, and none of that belongs
 * in a traffic table.
 *
 * The effect is keyed on the pathname, so it fires once per route change,
 * including the first render. Client-side navigations within the app count too
 * — which is the point, since almost all movement here is soft navigation and a
 * server-side hit counter would see one page load per session.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    recordPageView(pathname);
  }, [pathname]);

  return null;
}
