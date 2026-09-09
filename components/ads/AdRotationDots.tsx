"use client";

/**
 * Rotation indicator for a shared ad slot: one dot per matching ad, the
 * current one filled. Clicking jumps to that ad and stops the auto-rotation
 * for the rest of the page view.
 *
 * Deliberately understated — this marks a slot several advertisers share, it
 * is not a gallery control. The dots are 6px; the buttons are padded out to a
 * usable tap target without making the dots themselves any bigger.
 */
export function AdRotationDots({
  index,
  total,
  onSelect,
}: {
  /** 0-based index of the ad currently in the slot. */
  index: number;
  total: number;
  onSelect: (index: number) => void;
}) {
  if (total < 2) return null;

  return (
    // -ml-1 cancels the first button's padding so the dots still sit flush
    // left under the ad, without giving that one a smaller tap target.
    <div
      className="flex items-center -ml-3.5 md:-ml-1"
      role="group"
      aria-label="Sponsored ad rotation"
    >
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Show sponsored ad ${i + 1} of ${total}`}
          aria-current={i === index ? "true" : undefined}
          className="h-11 w-11 md:h-auto md:w-auto flex items-center justify-center md:p-1"
        >
          <span
            className={`block h-1.5 w-1.5 rounded-full transition-colors ${
              i === index ? "bg-gray-400" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
