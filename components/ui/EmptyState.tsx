import { Icon, type IconName } from "./Icon";

/**
 * What a list says when it has nothing in it.
 *
 * A LONE LINE OF GREY TEXT READS AS BROKEN. "No jobs posted yet." sitting at
 * the top-left of an otherwise empty page looks like the rest of the page
 * failed to load. A bordered, centred block with a glyph, a plain statement
 * and — where there is one — the next thing to do reads as a page that loaded
 * and is telling you something.
 *
 * Dashed border, deliberately: it is the one surface on the page that is a
 * placeholder rather than content, and a solid zinc card would make it look
 * like a record with nothing in it.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  /** One or two sentences: why it is empty, or what will fill it. */
  children?: React.ReactNode;
  /** A link or button for the obvious next step. */
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-accent">
        <Icon name={icon} className="w-6 h-6" strokeWidth={1.75} />
      </span>
      <p className="text-lg font-semibold text-white">{title}</p>
      {children && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">{children}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
