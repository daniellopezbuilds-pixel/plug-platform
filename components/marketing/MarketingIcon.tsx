/**
 * Glyphs for the public pages — the entry point at /, and login and signup.
 *
 * SAME IDIOM AS EVERYTHING ELSE. This project has no icon library and is not
 * getting one. Sidebar.tsx, NotificationBell.tsx, MobileTopBar.tsx and
 * components/ui/BadgeIcon.tsx all draw inline in the Heroicons outline style —
 * 24x24 viewBox, fill none, stroke currentColor, width 2, round caps — and
 * these match, so the public pages look like the product they open onto.
 *
 * Stroke is currentColor throughout: the caller sets colour by setting text
 * colour on the wrapper. Nothing here bakes in a palette value.
 *
 * `bolt` is deliberately the same path as BadgeIcon's — it is the Sparx Plug
 * mark and must not drift between the entry page and the badge.
 *
 * Kept to the glyphs actually in use. Add one when a page needs it, not in
 * anticipation.
 */

const PATHS: Record<string, React.ReactNode> = {
  // The trade, and the Sparx Plug mark.
  bolt: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,

  // Arrow right — the forward affordance on the primary action.
  arrow: <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />,
};

export function MarketingIcon({
  name,
  className = "w-6 h-6",
}: {
  name: keyof typeof PATHS | string;
  className?: string;
}) {
  const path = PATHS[name] ?? PATHS.bolt;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
