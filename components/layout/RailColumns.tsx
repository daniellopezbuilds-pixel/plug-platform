"use client";

import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * The column layout every dashboard page with side panels uses: main content,
 * a right rail from 1280px, and optionally a left rail from 1720px.
 *
 * WHY THE BREAKPOINTS ARE JS. Which columns exist decides which panels are
 * MOUNTED, and panels run queries — a card hidden with `hidden xl:block`
 * still fetches on a phone. So the page asks useRailBreakpoints() and renders
 * a panel only when its column exists, and this component derives the grid
 * template from the same two flags so the template always matches the
 * children. (Deriving it from CSS breakpoints instead put the main column in
 * the 272px slot for a frame during hydration.)
 *
 * 1280: below it the shell has ~690px of content width and a 320px rail
 * would squeeze the main column under 400. 1720, not 2xl's 1536: three
 * columns at 1536 leave the main column under 600.
 *
 *
 * STICKY, AND SCROLLING ON THEIR OWN
 *
 * Each rail is `position: sticky` against the dashboard's one scroll
 * container (the <section> in app/dashboard/layout.tsx), so the main column
 * scrolls past while the rails stay put. `items-start` on the grid is what
 * makes that possible: a stretched grid item is as tall as the row and has
 * nowhere to stick.
 *
 * A rail taller than the window is capped to the window and scrolls inside
 * itself — otherwise its lower cards could never be reached, because a sticky
 * element does not move. `overscroll-contain` stops reaching the end of a rail
 * from scrolling the page underneath it.
 *
 * top-6 and the matching 3rem in the height cap: the shell pads the content
 * by 40px at lg, and pinning the rail flush to the top of the window once
 * that padding scrolls away looks like it has hit something. 24px keeps it
 * clear. Rails only exist from 1280, which is always past lg, so there is no
 * mobile top bar to allow for here.
 *
 *
 * CAPPING A READING COLUMN (`mainMax`)
 *
 * The page fills the screen; individual columns do not have to. A post or a
 * message thread past about 800px is hard to read, so those pages pass a cap.
 * The capped column then stops growing and the RAILS grow instead — each
 * track is `minmax(its width, 1fr)` — so the extra width lands in the side
 * panels rather than as a hole beside the text or margins round the page.
 * Pages whose main column is a grid of cards pass no cap and use the width
 * for more cards.
 *
 * `-mx-1 px-1` gives focus rings room: overflow-y:auto clips horizontally too,
 * and a ring on a full-width control would otherwise be cut off at the edges.
 */

export function useRailBreakpoints() {
  return {
    /** A right rail exists. */
    withRail: useMediaQuery("(min-width: 1280px)"),
    /** A left rail exists as well. */
    split: useMediaQuery("(min-width: 1720px)"),
  };
}

const LEFT_WIDTH = 272;
const RIGHT_WIDTH = 320;

const RAIL =
  "sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain scrollbar-dark -mx-1 px-1 space-y-4";

export function RailColumns({
  withRail,
  split,
  left,
  right,
  leftLabel = "Side panel",
  rightLabel = "Side panel",
  mainMax,
  leftWidth = LEFT_WIDTH,
  children,
}: {
  withRail: boolean;
  split: boolean;
  /** Rendered only when `split`. Pass null for a page with no left rail. */
  left?: React.ReactNode;
  /** Rendered only when `withRail`. */
  right?: React.ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  /**
   * Cap on the main column, in px, for a reading surface. The rails then
   * GROW to take the slack instead of the page leaving a hole — see
   * "Capping a reading column" above. Omit for a page whose main column is a
   * grid of cards, which should simply use the width.
   */
  mainMax?: number;
  /**
   * Width of the left rail, in px, when a page puts something wider than a
   * list in it — My Local Network puts a filter panel there whose option
   * tiles wrap at the default 272.
   */
  leftWidth?: number;
  children: React.ReactNode;
}) {
  const hasLeft = split && !!left;
  const hasRight = withRail && !!right;

  // A capped main column only caps when there is a rail to hand the slack
  // to. With no rails at all it fills, since there is nothing to fill beside
  // it — a lone column is centred by nothing and would just leave a gap.
  const capped = mainMax !== undefined && (hasLeft || hasRight);
  const main = capped ? `minmax(0, ${mainMax}px)` : "minmax(0, 1fr)";
  const leftTrack = capped ? `minmax(${leftWidth}px, 1fr)` : `${leftWidth}px`;
  const rightTrack = capped ? `minmax(${RIGHT_WIDTH}px, 1fr)` : `${RIGHT_WIDTH}px`;

  const columns = [hasLeft && leftTrack, main, hasRight && rightTrack]
    .filter(Boolean)
    .join(" ");

  return (
    // An inline template rather than grid-cols-[...] classes: the tracks are
    // computed from mainMax, and Tailwind only generates classes it can see
    // written out literally in the source.
    <div className="grid items-start gap-6" style={{ gridTemplateColumns: columns }}>
      {hasLeft && (
        <aside aria-label={leftLabel} className={RAIL}>
          {left}
        </aside>
      )}

      {/* @container so a page can lay its cards out by the width it actually
          got, which depends on how many rails there are, not on the
          viewport. */}
      <div className="@container min-w-0">{children}</div>

      {hasRight && (
        <aside aria-label={rightLabel} className={RAIL}>
          {right}
        </aside>
      )}
    </div>
  );
}
