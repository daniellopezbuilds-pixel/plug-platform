import { supabase } from "@/lib/supabase";

/**
 * Impression and click capture for sponsored listings.
 *
 * CAPTURE ONLY. Nothing in the app reads ad_events — there is no reporting UI
 * and no rollup. This exists so that when reporting is built there is history
 * to report on, instead of a counter that starts the day someone gets round to
 * it. See supabase/migrations/20260916120000_ad_events.sql.
 *
 * THE ONE RULE: this must never break ad rendering or navigation. Every failure
 * path here is swallowed. An analytics write that takes the feed down with it
 * is a far worse outcome than a lost impression, and lost impressions are
 * already expected — see "what gets lost" below.
 *
 * WHY A RAW fetch AND NOT supabase.from().insert()
 *
 * The flush that matters most is the one on the way out of the page, and a
 * normal fetch is cancelled when the document goes away. `keepalive: true` is
 * what survives it, and supabase-js has no way to pass it through per request.
 * So this posts to PostgREST directly — the same endpoint, headers and body
 * that the client would have produced. One code path rather than two, because a
 * separate "unload" path would be the one that never gets exercised in
 * development and quietly rots.
 *
 * keepalive caps the body at 64KB. A batch is at most MAX_BATCH tiny objects,
 * nowhere near it.
 *
 * WHAT GETS LOST, AND WHY THAT IS ACCEPTABLE
 *
 * A hard crash, a killed tab, or a browser that ignores the visibility event
 * drops whatever is still queued — at most MAX_BATCH impressions or FLUSH_MS
 * of them. These numbers describe roughly what a brand was delivered; they are
 * not an invoice. Pricing is flat monthly, so nothing bills from this. Do not
 * move to per-impression pricing on top of it without server-side verification
 * — the write is client-side and therefore forgeable by anyone holding the anon
 * key, which is everyone.
 */

type AdEventType = "impression" | "click";

type QueuedAdEvent = {
  advertisement_id: string;
  event_type: AdEventType;
  /**
   * Deliberately absent from the payload: occurred_at and viewer_id are both
   * filled by the database. The client's clock is routinely wrong and its
   * claim about who it is cannot be trusted.
   */
};

/** Flush once this many events are waiting. */
const MAX_BATCH = 10;

/** Flush this long after the first event in a batch, even if it is alone. */
const FLUSH_MS = 10_000;

let queue: QueuedAdEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function endpoint() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? url + "/rest/v1/ad_events" : null;
}

/**
 * Send whatever is queued.
 *
 * The queue is emptied BEFORE the request goes out, not after it succeeds. A
 * retry would need a failure counter, a backoff and a cap, and would mean an
 * unreachable Supabase producing an ever-growing array in a tab someone leaves
 * open all day. Dropping is the honest failure for a metric nobody bills from.
 */
async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  if (queue.length === 0) return;

  const batch = queue;
  queue = [];

  const url = endpoint();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return;

  try {
    // The user's access token when there is one, so auth.uid() resolves in the
    // column default and the row is attributed. The anon key otherwise, which
    // is what a logged-out viewer sends and what makes viewer_id NULL.
    //
    // getSession() reads the local cookie rather than calling the auth server:
    // this runs on a flush timer and must not add a round trip, and the token
    // is verified by PostgREST at the other end regardless.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    await fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: "Bearer " + (session?.access_token ?? anonKey),
        // Do not send the inserted rows back; nothing here reads them.
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });
  } catch {
    // Swallowed on purpose. See "THE ONE RULE" above.
  }
}

/**
 * Flush when the page is being backgrounded or closed.
 *
 * `visibilitychange` → hidden rather than `unload`: unload does not fire
 * reliably on mobile, and registering one prevents the page entering the
 * back/forward cache. `pagehide` covers the bfcache and iOS Safari cases that
 * visibilitychange alone misses. Both are idempotent — a flush with an empty
 * queue returns immediately.
 */
function attachListeners() {
  if (listenersAttached || typeof document === "undefined") return;

  listenersAttached = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("pagehide", () => flush());
}

function enqueue(advertisementId: string, eventType: AdEventType) {
  if (typeof window === "undefined") return;
  if (!advertisementId) return;

  attachListeners();

  queue.push({ advertisement_id: advertisementId, event_type: eventType });

  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }

  // Timed from the FIRST event in the batch, not reset by each new one. A
  // steadily-arriving stream would otherwise keep pushing the deadline back
  // and never flush until MAX_BATCH.
  if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
  }
}

/**
 * An ad became the one on screen.
 *
 * Called from usePublicAds when the displayed ad changes — on first render, on
 * each rotation, and when a viewer picks one with the dots. One place, so the
 * three surfaces cannot drift apart.
 *
 * THIS IS A RENDER, NOT A VIEWPORT IMPRESSION. It does not check that the ad
 * was actually scrolled into view. Today the slot is a right-hand rail that is
 * visible at the top of the page, so the two are close to the same thing — but
 * they are not the same thing, and an IAB-style "50% of pixels for one second"
 * count would be lower. If a below-the-fold slot is ever sold, this needs an
 * IntersectionObserver before the number is shown to anyone who is paying for
 * it.
 */
export function recordAdImpression(advertisementId: string) {
  enqueue(advertisementId, "impression");
}

/**
 * A viewer followed an ad's link.
 *
 * Flushed immediately rather than batched. The links open in a new tab today,
 * so the page survives and a batched click would probably still make it — but
 * "probably" is doing a lot of work there, and a click is the rarer and more
 * valuable of the two events. It is also the one a brand will ask about first.
 */
export function recordAdClick(advertisementId: string) {
  enqueue(advertisementId, "click");
  flush();
}
