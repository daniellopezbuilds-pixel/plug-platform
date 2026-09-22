"use client";

/**
 * A horizontal tab strip.
 *
 * LIFTED OUT OF app/dashboard/admin/page.tsx RATHER THAN WRITTEN AFRESH. The
 * admin panel had this markup and this styling inline; the profile editor
 * needed the same thing, and a second copy of a tab strip is how two screens
 * start disagreeing about what an active tab looks like. Both now render from
 * here.
 *
 * STYLING MATCHES THE SIDEBAR ACTIVE TREATMENT: orange label, orange bar, same
 * accent token at the same weight. The bar is `border-b` here rather than
 * `border-l` because these run horizontally, and it is always present and
 * merely transparent when inactive — so switching tabs does not shift the
 * labels by two pixels.
 *
 * MOBILE SCROLLS, IT DOES NOT WRAP. Tabs that wrap to a second line move every
 * tab below the one being tapped and change the page's height as they do it.
 * The strip scrolls sideways instead.
 *
 * IT STAYS INSIDE THE PAGE CONTAINER. This used to carry `-mx-4 px-4` below
 * md, pulling itself out past the dashboard's padding so the strip ran edge to
 * edge while every other element on the page stopped at the container. It read
 * as a piece of the shell rather than a piece of the page, and its bottom rule
 * ran wider than the content it was dividing. `bleed` is kept as an opt-in for
 * a caller that genuinely wants the full-width treatment; nothing uses it
 * today.
 *
 * ACCESSIBILITY. Real `role="tablist"` / `role="tab"` semantics with
 * aria-selected and aria-controls, so the strip is announced as a tab set
 * rather than as a row of unrelated buttons. Each panel is expected to carry
 * `id={panelId(key)}` and `role="tabpanel"`.
 */

export type TabDef<K extends string> = {
  key: K;
  label: string;
  /** A count rendered as a pill after the label. Hidden when 0 or absent. */
  badge?: number;
};

/** The id a panel must carry for aria-controls to point at something real. */
export function tabPanelId(key: string) {
  return `tabpanel-${key}`;
}

function tabClass(active: boolean) {
  return [
    "px-5 py-3 font-semibold border-b-2 transition whitespace-nowrap shrink-0",
    active
      ? "border-accent text-accent"
      : "border-transparent text-gray-400 hover:text-white",
  ].join(" ");
}

export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  className = "mb-8",
  bleed = false,
}: {
  tabs: readonly TabDef<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
  /** Run to the screen edge below md instead of stopping at the container. */
  bleed?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex gap-2 border-b border-zinc-800 overflow-x-auto scrollbar-dark ${
        bleed ? "-mx-4 px-4 md:mx-0 md:px-0" : ""
      } ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={selected}
            aria-controls={tabPanelId(tab.key)}
            onClick={() => onChange(tab.key)}
            className={tabClass(selected)}
          >
            {tab.label}
            {!!tab.badge && (
              <span className="ml-2 bg-accent-2 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
