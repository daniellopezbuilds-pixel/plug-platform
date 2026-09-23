import Image from "next/image";

/**
 * The Sparx Plug logo, in the two arrangements the app needs.
 *
 *   horizontal  mark beside the "SPARX PLUG" wordmark — the sidebar, the
 *               mobile top bar, and the compact headers on the password pages
 *   stacked     mark over wordmark, as drawn — the brand column on the
 *               two-column auth pages, where there is room for it
 *
 * WHY TWO. The artwork is a stacked square. Shrunk to fit a 208px sidebar it
 * is ~60px wide and the wordmark under it is unreadable, so the narrow places
 * set the same two pieces side by side instead. Both come from the one source
 * file via scripts/build-brand-assets.mjs, which crops away the padding and
 * converts the white-on-black JPEG to a transparent PNG, so the logo sits on
 * the .grid-bg texture rather than in a black box.
 *
 * "ECOSYSTEM" IS TEXT, beneath the wordmark, because the artwork does not
 * include it — and it is what marks this as the app at ecosystem.sparxplug.com
 * rather than the marketing site.
 *
 * NO LAYOUT SHIFT: every image has explicit width and height at the size it is
 * shown, so its box is reserved before it loads — and Next generates 1x and 2x
 * files at that size, which is what keeps it sharp on a retina screen.
 */

/** Intrinsic pixel sizes of the generated files, for the aspect ratios. */
const MARK = { w: 714, h: 725, src: "/brand/sparxplug-mark.png" };
const WORD = { w: 487, h: 56, src: "/brand/sparxplug-wordmark.png" };
const LOCKUP = { w: 722, h: 835, src: "/brand/sparxplug-lockup.png" };

export function BrandLogo({
  variant = "horizontal",
  size = 36,
  ecosystem = true,
  eager = false,
  className = "",
}: {
  variant?: "horizontal" | "stacked";
  /**
   * horizontal: the height of the mark, in px.
   * stacked: the width of the whole logo, in px.
   */
  size?: number;
  /** Show "Ecosystem" beneath the logo. */
  ecosystem?: boolean;
  /** For a logo above the fold on first paint — the sidebar, the auth pages. */
  eager?: boolean;
  className?: string;
}) {
  const loading = eager ? "eager" : undefined;

  if (variant === "stacked") {
    const height = Math.round((size * LOCKUP.h) / LOCKUP.w);
    return (
      <span className={`inline-flex flex-col items-center ${className}`}>
        <Image
          src={LOCKUP.src}
          alt="Sparx Plug"
          width={size}
          height={height}
          loading={loading}
          style={{ width: size, height }}
        />
        {ecosystem && (
          <span
            className="mt-2 font-semibold uppercase tracking-[0.35em] text-accent-2-soft"
            // Scales with the logo so the two stay in proportion.
            style={{ fontSize: Math.max(11, Math.round(size * 0.075)) }}
          >
            Ecosystem
          </span>
        )}
      </span>
    );
  }

  const markWidth = Math.round((size * MARK.w) / MARK.h);
  // The wordmark sized so its cap height sits comfortably beside the mark.
  const wordWidth = Math.round(size * 3.05);
  const wordHeight = Math.round((wordWidth * WORD.h) / WORD.w);

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Decorative: the wordmark beside it carries the name. */}
      <Image
        src={MARK.src}
        alt=""
        width={markWidth}
        height={size}
        loading={loading}
        style={{ width: markWidth, height: size }}
        className="shrink-0"
      />
      <span className="flex min-w-0 flex-col">
        <Image
          src={WORD.src}
          alt="Sparx Plug"
          width={wordWidth}
          height={wordHeight}
          loading={loading}
          style={{ width: wordWidth, height: wordHeight }}
        />
        {ecosystem && (
          <span className="mt-0.5 pl-0.5 text-[11px] font-semibold uppercase leading-none tracking-[0.3em] text-accent-2-soft">
            Ecosystem
          </span>
        )}
      </span>
    </span>
  );
}
