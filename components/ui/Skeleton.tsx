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
}: {
  count: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className="space-y-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i}>{children}</div>
        ))}
      </div>
    </>
  );
}

/** Matches PostCard: bg-zinc-900 card, author line, body, reaction row. */
export function PostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading posts">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="mb-3">
          <SkeletonBlock className="h-4 w-40 mb-2" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
        <SkeletonBlock className="h-3 w-full mb-2" />
        <SkeletonBlock className="h-3 w-11/12 mb-2" />
        <SkeletonBlock className="h-3 w-2/3 mb-4" />
        <SkeletonBlock className="h-8 w-48" />
      </div>
    </SkeletonList>
  );
}

/** Matches JobCard: title, meta line, description, action row. */
export function JobSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonList count={count} label="Loading jobs">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <SkeletonBlock className="h-6 w-2/3 mb-3" />
        <SkeletonBlock className="h-3 w-1/3 mb-4" />
        <SkeletonBlock className="h-3 w-full mb-2" />
        <SkeletonBlock className="h-3 w-4/5 mb-4" />
        <SkeletonBlock className="h-9 w-28" />
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
