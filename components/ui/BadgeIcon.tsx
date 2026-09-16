/**
 * The glyph for a badge, chosen by name from badges.icon.
 *
 * DATA, NOT A SWITCH ON badge_key. The name comes from the row, so a badge
 * added by a migration arrives with its icon already chosen and nothing here
 * has to change — provided it picks one of the glyphs below.
 *
 * WHY HAND-DRAWN SVG. This project has no icon library and adding one for three
 * glyphs is not worth a dependency. Sidebar.tsx, NotificationBell.tsx and
 * MobileTopBar.tsx already draw their icons inline in the Heroicons outline
 * idiom — 24x24, fill none, stroke currentColor, width 2, round caps — and
 * these match it so the badges look like they belong to the same set.
 *
 * Stroke is currentColor throughout, so the caller sets the colour by setting
 * text colour on the wrapper. No colour is baked in here.
 *
 * An unrecognised name falls back to a plain ring rather than rendering
 * nothing: the database is allowed to ship a badge this file has not seen, and
 * a missing glyph should look unfinished, not collapse the layout.
 */

const PATHS: Record<string, React.ReactNode> = {
  // Lightning bolt. The trade, and the Sparx Plug mark.
  bolt: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,

  // Shield with a tick — a credential that was checked.
  "shield-check": (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  ),

  // Building with a tick. Composed rather than copied: no outline set ships a
  // building-with-tick, so the building is drawn narrow to leave the
  // bottom-right corner clear for the tick.
  "building-check": (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V6a1 1 0 011-1h7a1 1 0 011 1v5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h11" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 9h.01M10.5 9h.01M7.5 13h.01M10.5 13h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 17.5l2.5 2.5L22 15" />
    </>
  ),

  // Fallback. Also the column default, so a badge seeded without an icon gets
  // this rather than nothing.
  badge: <circle cx="12" cy="12" r="8" />,
};

export function BadgeIcon({
  icon,
  className = "w-5 h-5",
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const path = PATHS[icon ?? ""] ?? PATHS.badge;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
