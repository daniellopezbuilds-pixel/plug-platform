/**
 * Skeleton placeholders for lists whose shape is known before the data lands.
 *
 * Preferred over a spinner wherever the result is a list of cards: the page
 * reaches its final height immediately, so nothing jumps when the data
 * arrives, and it reads as "content is coming" rather than "something is
 * happening".
 *
 * `animate-pulse` is Tailwind's built-in opacity cycle;
 * `motion-reduce:animate-none` leaves a flat grey block, which is a perfectly
 * legible resting state and needs no substitute animation.
 *
 * Each list wrapper is marked `aria-hidden` with a `role="status"` label
 * alongside it — a screen reader should hear "Loading posts" once, not read
 * out a dozen empty grey boxes.
 */

/** One grey block. Width and height come from the caller. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-zinc-800 rounded animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

function SkeletonList({
  count,
  label,
  children,
  gap = "space-y-5",
}: {
  count: number;
  label: string;
  children: React.ReactNode;
  /** Must match the gap of the list it stands in for, or it jumps on load. */
  gap?: string;
}) {
  return (
    <>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className={gap}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i}>{children}</div>
        ))}
      </div>
    </>
  );
}

/** Matches PostCard: avatar + author line, body, action band. */
export function PostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading posts" gap="space-y-3">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl">
        <div className="px-4 pt-3.5">
          <div className="flex items-center gap-3 mb-3">
            <SkeletonBlock className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1">
              <SkeletonBlock className="h-3.5 w-40 mb-2" />
              <SkeletonBlock className="h-2.5 w-24" />
            </div>
          </div>
          <SkeletonBlock className="h-3 w-full mb-2" />
          <SkeletonBlock className="h-3 w-11/12 mb-2" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
        <div className="mt-3 border-t border-zinc-800/80 px-4 py-3 flex justify-between">
          <SkeletonBlock className="h-5 w-20" />
          <SkeletonBlock className="h-5 w-24" />
        </div>
      </div>
    </SkeletonList>
  );
}

/** Matches JobCard: eyebrow, title, pay, fact grid, footer button. */
export function JobSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading jobs" gap="space-y-3">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <SkeletonBlock className="h-3 w-28 mb-3" />
        <SkeletonBlock className="h-6 w-2/3 mb-2" />
        <SkeletonBlock className="h-3 w-1/3 mb-4" />
        <SkeletonBlock className="h-5 w-24 mb-4" />
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 mb-5">
          <SkeletonBlock className="h-3 w-3/4" />
          <SkeletonBlock className="h-3 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
          <SkeletonBlock className="h-3 w-3/5" />
        </div>
        <div className="border-t border-zinc-800 pt-4 flex sm:justify-end">
          <SkeletonBlock className="h-11 w-full sm:w-32" />
        </div>
      </div>
    </SkeletonList>
  );
}

/** Matches the branding-deals submission card: 4:1 image, title, status pill. */
export function AdSubmissionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading your submissions">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <SkeletonBlock className="w-full aspect-[4/1] max-h-28 mb-3" />
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-4 w-16 rounded-full" />
        </div>
        <SkeletonBlock className="h-3 w-1/2" />
      </div>
    </SkeletonList>
  );
}

/** Generic card list, for admin panels and anything without a bespoke shape. */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <SkeletonBlock className="h-5 w-1/2 mb-3" />
        <SkeletonBlock className="h-3 w-full mb-2" />
        <SkeletonBlock className="h-3 w-3/4" />
      </div>
    </SkeletonList>
  );
}
