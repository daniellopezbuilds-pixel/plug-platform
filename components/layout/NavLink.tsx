"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A sidebar nav item that knows whether it is the current page.
 *
 * Shared by the desktop sidebar and the mobile drawer, because they are the
 * same `<Sidebar>` rendered at two breakpoints — the active treatment comes
 * along for free rather than being duplicated.
 *
 * MATCHING
 *
 * Prefix by default, so a nested route keeps its parent highlighted:
 * /dashboard/profile/edit lights up Profile, /dashboard/branding-deals/123
 * lights up Branding deals.
 *
 * The prefix test requires a segment boundary (`href + "/"`), not a bare
 * startsWith — otherwise /dashboard/profiles would light up Profile, and any
 * future sibling route sharing a name prefix would too.
 *
 * `exact` exists for /dashboard itself. Every other href starts with
 * "/dashboard/", so a prefix match there would mark Dashboard active on every
 * page in the app.
 *
 * A note for whoever adds routes later: two items where one href is a path
 * prefix of the other (/dashboard/jobs and /dashboard/jobs/create) would BOTH
 * match on the deeper route. That is not a live problem today because those
 * two are in mutually exclusive role branches and never render together. If
 * that ever changes, the deeper one needs `exact`.
 */
export function NavLink({
  href,
  exact = false,
  onNavigate,
  children,
}: {
  href: string;
  /** Match this href only, never its descendants. Used for /dashboard. */
  exact?: boolean;
  /** Closes the mobile drawer. Fires on the current page too, which is right. */
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      // aria-current is what a screen reader announces; colour alone is not an
      // indication of the current page.
      aria-current={active ? "page" : undefined}
      className={[
        // -mx-6 px-6 cancels the sidebar's p-6 so the tint and the bar run to
        // the sidebar's own edge rather than floating inset. The margins
        // exactly cancel the padding, so nothing overflows horizontally.
        "flex items-center gap-2 -mx-6 px-6 min-h-11 md:min-h-0 md:py-1.5 transition",
        // The bar is always present and merely transparent when inactive.
        // Adding a 3px border only on the active item would shift the label
        // 3px sideways every time the route changes.
        "border-l-[3px]",
        active
          ? "border-accent bg-accent/10 text-accent font-semibold"
          : "border-transparent hover:text-accent-2-soft",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
