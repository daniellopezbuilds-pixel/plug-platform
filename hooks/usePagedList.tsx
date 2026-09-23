"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Paging for a list hook: one page on mount, more on demand.
 *
 * EVERY fetchPage MUST END ITS ORDER WITH A UNIQUE COLUMN — `.order("id")`
 * after the timestamp. range() paging over a sort key with ties is
 * nondeterministic: Postgres may return tied rows in a different order on
 * each request, so one row lands on two pages and another on none. The
 * dedupe below hides the repeat, which leaves the skip invisible. Found on
 * 2026-09-23 in the admin licence queue, where two claims share a
 * requested_at; walked one row per page, one claim was never shown.
 *
 * LIFTED OUT OF useAds RATHER THAN INVENTED. Infinite scroll was built on
 * 2026-09-15 and wired into exactly one list — the brand's own ad submissions.
 * Every other list on the platform fetched its whole table and rendered all of
 * it: the directory, the jobs board, applications, applicants, the feed, the
 * message thread and all five admin queues. This is that one working
 * implementation, generalised, so the fix is the same fix everywhere instead of
 * nine slightly different ones.
 *
 * WHY offset PAGING AND NOT A CURSOR. Every list here is ordered by created_at
 * descending over a table where inserts land at the top, so an offset window
 * can shift under the reader and repeat a row. That is handled below by
 * deduplicating on id rather than by moving to keyset pagination — which would
 * be the right answer at a scale none of these tables are near, and which
 * several of them could not use anyway because they sort on a joined column.
 * Revisit when a list is deep enough for the extra request to matter.
 *
 * ONE EXTRA REQUEST, NOT AN EXACT COUNT. `hasMore` is "the last page came back
 * full", so the final fetch returns fewer rows and ends the list. Asking
 * PostgREST for an exact count on every page is a second scan of the filtered
 * set for a number only used to decide whether to draw a sentinel.
 */

export type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export function usePagedList<T>({
  pageSize,
  fetchPage,
  getId,
  skip = false,
}: {
  /**
   * Rows per page, or null to fetch everything in one go.
   *
   * null is a real option and not a cop-out: the admin ad manager wants the
   * whole set so it can be scanned, and a hook that could only page would have
   * to be worked around there.
   */
  pageSize: number | null;
  /**
   * Runs one page. MUST be a stable useCallback — it is this hook's only
   * dependency, so an inline function would refetch on every render.
   *
   * `limit` is null when pageSize is, meaning "no range clause".
   */
  fetchPage: (offset: number, limit: number | null) => PromiseLike<PageResult<T>>;
  /** Identity for deduplication across pages. */
  getId: (item: T) => string;
  /**
   * Hold off entirely. Without it a hook still resolving its user id runs one
   * unscoped query first and briefly renders somebody else's rows.
   */
  skip?: boolean;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (skip) {
      // Still waiting on the caller — not finished with nothing to show. The
      // difference matters: the second renders an empty state.
      setItems([]);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: err } = await fetchPage(0, pageSize);

    if (err || !data) {
      setItems([]);
      setHasMore(false);
      setError(err?.message ?? null);
      setLoading(false);
      return;
    }

    setItems(data);
    setHasMore(pageSize ? data.length === pageSize : false);
    setLoading(false);
  }, [fetchPage, skip, pageSize]);

  const loadMore = useCallback(async () => {
    if (!pageSize || loadingMore || !hasMore) return;

    setLoadingMore(true);

    const { data, error: err } = await fetchPage(items.length, pageSize);

    if (!err && data) {
      // Deduplicated by id: a row inserted between pages shifts the offset
      // window down, which would otherwise repeat whatever was at the boundary.
      setItems((prev) => {
        const seen = new Set(prev.map(getId));
        return [...prev, ...data.filter((row) => !seen.has(getId(row)))];
      });
      setHasMore(data.length === pageSize);
    }

    setLoadingMore(false);
  }, [fetchPage, getId, pageSize, loadingMore, hasMore, items.length]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    items,
    /** For optimistic updates — an admin approving a row removes it locally. */
    setItems,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    reload: load,
  };
}
