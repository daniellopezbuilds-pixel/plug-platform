/**
 * The heading block at the top of a dashboard page.
 *
 * Every page had its own `<h1>` before this, and they had drifted: mostly
 * `text-5xl mb-8`, but the dashboard used `mb-2` and branding-deals used
 * `text-4xl mb-3`, so the gap between the title and the content below it
 * changed as you moved between pages.
 *
 * The margin lives on the wrapper, not the `<h1>`, so a page with a subtitle
 * gets the same distance to its content as a page without one.
 *
 * `text-4xl sm:text-5xl` because 48px wraps awkwardly on narrow screens for
 * the longer titles ("My Local Network", "Community Feed").
 */
export function PageHeading({
  title,
  subtitle,
  actions,
  size = "default",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional right-aligned controls, vertically centred against the title. */
  actions?: React.ReactNode;
  /**
   * "compact" for pages where the content, not the title, is the point of
   * arriving — the feed. 48px of title and 32px under it is 80px of a laptop
   * screen spent saying which page you clicked.
   */
  size?: "default" | "compact";
}) {
  const compact = size === "compact";

  return (
    <header className={compact ? "mb-4" : "mb-8"}>
      <div className="flex items-start justify-between gap-4">
        <h1
          className={`font-bold text-white leading-tight ${
            compact ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
          }`}
        >
          {title}
        </h1>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {subtitle && (
        <p className={`text-gray-400 max-w-2xl ${compact ? "mt-1 text-sm" : "mt-2"}`}>{subtitle}</p>
      )}
    </header>
  );
}
