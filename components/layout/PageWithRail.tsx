/** Width of the rail, and the gutter beside it. Both are this file's to know. */
const RAIL_WIDTH = 320;
const GUTTER = 32; // must match the `gap-8` on the row below

/**
 * Two-column page: main content, plus a side rail.
 *
 * Used by the three pages that carry an ad (feed, jobs, marketplace) so the
 * slot sits in the same place on all of them, and by the profile for its
 * badges. Before this, the ad was in the content flow — a banner above the
 * listings on jobs and marketplace, and on the feed both a banner AND a second
 * copy injected into the post stream — which pushed the real content down and
 * put an advert in the middle of it.
 *
 * BREAKPOINT: `xl` (1280px), not `lg`. At 1024px the shell has already spent
 * 256px on the sidebar and 48px on padding, leaving ~688px; taking 320 of that
 * for the rail would squeeze the content column to under 400px. Side-by-side
 * starts where there is genuinely room for both.
 *
 * GUTTER: `gap-8` — 32px between the two columns, at every width. That number
 * is the gutter and nothing else should be adding to it. See below.
 *
 * NO REFLOW WHEN THE AD LOADS: the rail keeps its 320px whether or not it has
 * anything in it (`xl:w-[320px] xl:shrink-0`), so the content column's width is
 * fixed from first paint. The one exception is `railCollapsed` — see below.
 *
 *
 * `contentClassName` — WHERE THE WIDTH CAP HAS TO GO
 *
 * On a reading page the content column is capped, and the cap MUST be on the
 * flex item itself, which is why this is a prop rather than something the page
 * wraps its own children in.
 *
 * Putting it on an inner div instead is a bug I shipped and had to be told
 * about. `flex-1` makes this item grow to fill the row — about 1168px at 1920 —
 * and an inner `max-w-[720px]` then caps only the content *inside* that item.
 * The other ~450px stays inside the column, between the text and the rail, and
 * reads as a hole in the middle of the page.
 *
 * With the cap on the item, the item stops growing at its max-width and the
 * leftover stays in the container, where `measure="reading"` then centres the
 * pair as a unit. The gap between the columns is exactly `gap-8`.
 *
 * Note the `xl:mx-0` a page passes alongside `mx-auto`: `margin: auto` absorbs
 * free space before anything else gets it, so leaving it on from xl would put
 * the slack back beside the rail — the same hole, by a different route.
 *
 *
 * `heading` — WHY THE TITLE COMES THROUGH HERE
 *
 * The page title has to be laid out by this component, not rendered above it.
 *
 * When a page put its own `<PageHeading>` above `<PageWithRail>`, the heading
 * took the full width of the shell's content area while the column pair was
 * centred inside it. At 1440 the slack is ~10px and nobody notices. At 1920 the
 * slack is 224px per side, so the title sat 224px to the LEFT of the column it
 * names — floating in the margin, pointing at nothing.
 *
 * So the heading is passed in and rendered here, in a wrapper carrying the same
 * `contentClassName` as the content column. Same cap, same left edge, at every
 * width, with no second copy of the centring arithmetic to keep in sync.
 *
 * It sits ABOVE the flex row rather than inside the content column on purpose.
 * Inside the column, `railFirst` would stack the advert above the page's own
 * title on a phone. Outside it, the stacked order stays title → rail → content.
 *
 *
 * `measure="reading"` — HOW THE PAIR IS CENTRED
 *
 * A `max-width` on the wrapper, NOT `justify-content` on the row.
 *
 * `justify-content` centres the items but leaves the row itself full-width, so
 * the heading — which is outside the row — has no way to find the column's left
 * edge. Sizing the wrapper to the pair (720 + 32 + 320 = 1072) and centring
 * that instead puts the heading and the content column on the same left edge by
 * construction, because they are now both children of a box that starts exactly
 * there.
 *
 * THE WIDTH IS COMPUTED, NOT INTRINSIC. `w-fit` looks like the obvious way to
 * size the wrapper and is a trap: it resolves to the row's max-content width,
 * which depends on what is inside the column. On the feed that is a textarea
 * and some post cards whose max-content contribution is far under the cap, so
 * the wrapper shrank to 672px and squeezed the content column to 320 — half the
 * page missing, from a rule that never mentions 320.
 *
 * So the pair width is derived here from one number, `readingWidth`, and passed
 * down as a custom property. The rail's 320 and the 32px gutter are this
 * component's own constants, so nothing outside has to know the arithmetic and
 * there is no second literal to keep in step.
 *
 * Custom properties rather than an inline `style` max-width because the cap
 * must apply only from xl, and an inline style cannot carry a breakpoint —
 * the same reason FULL_HEIGHT_PANEL_CLASS in lib/layout.tsx is a class string.
 *
 *
 * `railCollapsed` — WHEN THERE IS NOTHING TO RESERVE FOR
 *
 * Reserving the rail's width unconditionally is right while an ad is on its
 * way and wrong once you know none is coming. On a placement with no live ad —
 * jobs and marketplace whenever that surface is unsold — the reserved 320px
 * plus its 32px gutter is simply 352px of dead column down the right of the
 * page, at every width from 1280 up.
 *
 * With `railCollapsed` the `<aside>` is not rendered at all, so it is not a
 * flex item, so `gap-8` produces no gap for it either and the content column
 * takes the full width.
 *
 * The caller decides, because only the caller knows whether the slot will
 * fill; see `PageWithSponsoredRail`, which holds the single ad query and waits
 * for it to resolve before collapsing. The cost is one settle per page load on
 * an unsold placement — the content widens once when the query comes back
 * empty — which is the trade for not shipping a permanent hole.
 *
 *
 * `railFirst` — WHICH ONE COMES FIRST WHEN THEY STACK
 *
 * Below xl the two columns stack, and the DOM order decides which is on top.
 * The sponsored slot goes above the content (`railFirst`, the default, with
 * `xl:order-2` moving it back to the right on desktop) because that is where
 * an ad belongs and it is what the brief specified.
 *
 * The profile's badges are the opposite case: above the edit form on a phone
 * they push the thing you came to do off the screen. Those pass
 * `railFirst={false}`, which renders the rail AFTER the content in the DOM —
 * so it stacks underneath on a phone and lands on the right at xl, with no
 * order classes involved either way.
 *
 * The DOM order is swapped rather than left alone and re-ordered in CSS. It
 * used to render the aside first unconditionally and rely on `xl:order-*` to
 * place it, and `railFirst={false}` then did neither of the things it claimed:
 * the badges stacked ABOVE the profile form on a phone, and sat on its LEFT at
 * xl. Both this comment and the profile page's said "right rail"; only the CSS
 * disagreed. Source order is also what a screen reader and the tab key follow,
 * so it is the thing that has to be right.
 */
export function PageWithRail({
  children,
  rail,
  heading,
  label = "Sponsored",
  measure = "wide",
  readingWidth = 720,
  contentClassName = "",
  railFirst = true,
  railCollapsed = false,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
  /** The page's `<PageHeading>`. Laid out here so it tracks the content column. */
  heading?: React.ReactNode;
  /** Accessible name for the rail. */
  label?: string;
  /** "reading" centres the capped pair; "wide" fills the container. */
  measure?: "reading" | "wide";
  /**
   * Width of the content column from xl, when measure is "reading". The pair's
   * width is derived from it; ignored entirely when measure is "wide".
   */
  readingWidth?: number;
  /** Width cap for the content column. Applied to the flex item — see above. */
  contentClassName?: string;
  /** Whether the rail stacks above the content below xl. */
  railFirst?: boolean;
  /** Drop the rail entirely, so its width is not reserved. See above. */
  railCollapsed?: boolean;
}) {
  const reading = measure === "reading";

  // The pair is the column plus, unless it has been collapsed away, the rail
  // and the gutter that separates them.
  const pairWidth =
    readingWidth + (railCollapsed ? 0 : GUTTER + RAIL_WIDTH);

  const railNode = railCollapsed ? null : (
    <aside
      aria-label={label}
      // xl:order-2 only in the railFirst case, where the DOM has to put the
      // rail first (so it stacks on top) but the desktop row wants it on the
      // right. With railFirst false the DOM order below is already what both
      // layouts want, so no order class is needed — or wanted, since an order
      // class here would fight the source order rather than agree with it.
      className={`w-full xl:w-[320px] xl:shrink-0 ${railFirst ? "xl:order-2" : ""}`}
    >
      {/* Sticky so the slot stays visible down a long feed, and top-0
          because the scroll container is the layout's <section>. */}
      <div className="xl:sticky xl:top-0">{rail}</div>
    </aside>
  );

  // min-w-0 so long words and wide children (tables, code, image rows)
  // shrink instead of forcing the flex row wider than the viewport.
  const contentNode = (
    <div
      className={`min-w-0 w-full flex-1 ${contentClassName} ${
        reading ? "xl:max-w-[var(--content-w)]" : ""
      } ${railFirst ? "xl:order-1" : ""}`}
    >
      {children}
    </div>
  );

  return (
    <div
      className={reading ? "xl:mx-auto xl:max-w-[var(--pair-w)]" : ""}
      style={
        reading
          ? ({
              "--pair-w": `${pairWidth}px`,
              "--content-w": `${readingWidth}px`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {heading && (
        <div className={`${contentClassName} ${reading ? "xl:max-w-[var(--content-w)]" : ""}`}>
          {heading}
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-start gap-8">
        {railFirst ? (
          <>
            {railNode}
            {contentNode}
          </>
        ) : (
          <>
            {contentNode}
            {railNode}
          </>
        )}
      </div>
    </div>
  );
}
