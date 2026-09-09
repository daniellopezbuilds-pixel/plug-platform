/**
 * Two-column page: main content, plus a right rail for the sponsored slot.
 *
 * Used by the three pages that carry an ad (feed, jobs, marketplace) so the
 * slot sits in the same place on all of them. Before this, the ad was in the
 * content flow — a banner above the listings on jobs and marketplace, and on
 * the feed both a banner AND a second copy injected into the post stream —
 * which pushed the real content down and put an advert in the middle of it.
 *
 * BREAKPOINT: `xl` (1280px), not `lg`. At 1024px the shell has already spent
 * 256px on the sidebar and 48px on padding, leaving ~720px; taking 320 of that
 * for the rail would squeeze the content column to under 400px. Side-by-side
 * starts where there is genuinely room for both.
 *
 * STACKING ORDER: the rail is first in the DOM and moved to the right with
 * `xl:order-2`. Below `xl` that puts it above the content, as specified, with
 * no duplicate markup and nothing hidden.
 *
 * NO REFLOW WHEN THE AD LOADS: the rail keeps its 320px whether or not it has
 * anything in it (`xl:w-[320px] xl:shrink-0`), so the content column's width is
 * fixed from first paint.
 */
export function PageWithRail({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-start gap-8">
      <aside
        aria-label="Sponsored"
        className="w-full xl:order-2 xl:w-[320px] xl:shrink-0"
      >
        {/* Sticky so the slot stays visible down a long feed, and top-0
            because the scroll container is the layout's <section>. */}
        <div className="xl:sticky xl:top-0">{rail}</div>
      </aside>

      {/* min-w-0 so long words and wide children (tables, code, image rows)
          shrink instead of forcing the flex row wider than the viewport. */}
      <div className="min-w-0 flex-1 xl:order-1">{children}</div>
    </div>
  );
}
