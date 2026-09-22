"use client";

import { useEffect, useRef } from "react";
import { Spinner } from "./Spinner";

/**
 * The end of a paged list: a sentinel that fetches on approach, a button that
 * does the same thing on click, and a line saying when there is no more.
 *
 * BOTH, NOT JUST THE SENTINEL. Infinite scroll on its own has two failure
 * modes that a button does not: it is unreachable by keyboard, since nothing
 * focusable exists to move to, and it never fires when the list is inside a
 * container that is not the scroller the observer was given. The button is
 * always there and always works; the sentinel just means most people never
 * have to press it.
 *
 * `root` scopes the observer to a scrolling panel rather than the viewport.
 * The brand's submissions list is inside its own scrollbox and needs it; a
 * full-page list leaves it undefined and watches the viewport.
 *
 * rootMargin pulls the trigger 200px early so the next page is usually in
 * before the reader reaches the bottom.
 */
export function LoadMore({
  hasMore,
  loadingMore,
  onLoadMore,
  root,
  /** Shown once the list is complete. Omit for a list too short to need one. */
  endMessage = "That's everything.",
  showEndMessage = true,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  root?: React.RefObject<HTMLElement | null>;
  endMessage?: string;
  showEndMessage?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { root: root?.current ?? null, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, root]);

  if (!hasMore) {
    if (!showEndMessage) return null;

    return (
      <p className="text-xs text-gray-400 text-center py-3">{endMessage}</p>
    );
  }

  return (
    <>
      <div ref={sentinelRef} aria-hidden />

      <div className="flex justify-center py-3">
        {loadingMore ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" label="" />
            <span className="text-xs text-gray-400">Loading more</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onLoadMore}
            className="text-sm font-semibold text-gray-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-lg px-5 py-2.5 transition min-h-11"
          >
            Load more
          </button>
        )}
      </div>
    </>
  );
}
