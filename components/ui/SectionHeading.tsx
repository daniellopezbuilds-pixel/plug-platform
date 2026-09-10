/**
 * A section heading within a dashboard page — one level below `PageHeading`.
 *
 * Existed in five variants before this, all hand-written: `text-2xl mb-5`,
 * `text-2xl mb-4`, `text-2xl mb-3`, `text-2xl` with no margin, `text-xl mb-4`,
 * and on branding-deals a `text-xs uppercase tracking-widest` label that
 * matched nothing else in the app. `text-2xl font-bold mb-4` was the most
 * common, so that is what this standardises on.
 *
 * Belongs OUTSIDE the card it introduces, not inside it. A heading inside one
 * card and outside another makes two columns of the same page read as
 * different kinds of thing.
 */
export function SectionHeading({
  children,
  actions,
}: {
  children: React.ReactNode;
  /** Optional controls on the same line, right-aligned. */
  actions?: React.ReactNode;
}) {
  if (actions) {
    return (
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold text-white">{children}</h2>
        <div className="shrink-0">{actions}</div>
      </div>
    );
  }

  return <h2 className="text-2xl font-bold text-white mb-4">{children}</h2>;
}
