/**
 * Dashboard layout constants.
 *
 * These exist because two places have to agree on the same number and the
 * agreement is invisible otherwise.
 */

/**
 * Height for a panel that fills the viewport rather than scrolling with the
 * content column — currently just the messages chat panel.
 *
 * The arithmetic, against `app/dashboard/layout.tsx`:
 *
 *   under md   3.5rem mobile top bar (h-14) + 3rem page padding (py-6)  = 6.5rem
 *   md and up  no top bar          + 5rem page padding (py-10)          = 5rem
 *
 * Two values because the top bar eats height that does not exist on desktop.
 * A class string rather than an inline style, because an inline style cannot
 * carry a breakpoint.
 *
 * WRITTEN OUT IN FULL ON PURPOSE. Tailwind scans source files for literal
 * class names, so building these with a template literal from numeric
 * constants would produce classes Tailwind never generates and the panel would
 * silently have no height at all.
 *
 * `dvh` under md, not `vh`: on mobile Safari `100vh` is the viewport with the
 * URL bar hidden, so a `100vh` panel is taller than the visible area and its
 * bottom — the message composer — ends up under the browser chrome.
 */
export const FULL_HEIGHT_PANEL_CLASS =
  "h-[calc(100dvh-6.5rem)] md:h-[calc(100vh-5rem)]";
