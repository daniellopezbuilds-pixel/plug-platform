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
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Optional right-aligned controls, vertically centred against the title. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
          {title}
        </h1>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {subtitle && (
        <p className="text-gray-400 mt-2 max-w-2xl">{subtitle}</p>
      )}
    </header>
  );
}
