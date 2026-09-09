/**
 * The one loading spinner.
 *
 * A bordered circle with two of its four border segments coloured, rotated by
 * Tailwind's `animate-spin`. No SVG and no dependency — a border arc costs
 * nothing and scales cleanly at every size.
 *
 * Two segments rather than one: at `sm` (16px) a single coloured segment reads
 * as a spinning dash rather than a ring.
 *
 * REDUCED MOTION
 *
 * `motion-reduce:animate-none` alone would leave a frozen three-quarter arc,
 * which reads as a broken graphic rather than a deliberate resting state. So
 * the remaining segments are coloured back in at the same breakpoint, and what
 * a reduced-motion user sees is a complete, static orange ring.
 *
 * ACCESSIBILITY
 *
 * `role="status"` plus a visually hidden label, so the spinner is announced
 * rather than being a silent decorative div. Callers that already render their
 * own text ("Loading your feed") pass `label` to match, or `labelledBy` when
 * the surrounding text is the label.
 */
const SIZES = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
} as const;

export function Spinner({
  size = "md",
  label = "Loading",
  className = "",
}: {
  size?: keyof typeof SIZES;
  /** Announced to assistive tech. Never rendered visually. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={`inline-flex shrink-0 ${className}`}
    >
      <span
        className={[
          SIZES[size],
          "rounded-full border-transparent border-t-accent border-r-accent animate-spin",
          // Static complete ring instead of a stalled arc.
          "motion-reduce:animate-none motion-reduce:border-accent motion-reduce:opacity-60",
        ].join(" ")}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
