import { supabase } from "@/lib/supabase";

/**
 * Page-view capture.
 *
 * Deliberately the same machinery as lib/adEvents.tsx — batched queue, raw
 * keepalive fetch to PostgREST, flush on hide — because it is the same problem
 * and two half-different implementations of it would be worse than one shared
 * shape. Read the long comments in that file for why each piece is as it is;
 * only the differences are explained here.
 *
 * THE ONE RULE, unchanged: this must never break navigation. Every failure path
 * is swallowed. Losing a page view costs a number in an email; throwing during
 * a route change costs the page.
 */

type QueuedPageView = {
  path: string;
  session_id: string;
  /**
   * viewer_id and created_at are absent on purpose: the database fills both.
   * The client's clock is routinely wrong and its claim about who it is cannot
   * be trusted. See the column comments in 20260917130000_page_views.sql.
   */
};

/** Flush once this many views are waiting. */
const MAX_BATCH = 10;

/** Flush this long after the first view in a batch, even if it is alone. */
const FLUSH_MS = 10_000;

const SESSION_KEY = "sparx:view-session";

let queue: QueuedPageView[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

/**
 * The id that turns page loads into visits.
 *
 * sessionStorage, not localStorage: it dies with the tab, which is roughly what
 * a visit is, and it never becomes a durable identifier that follows a
 * logged-out person between sessions. That is a privacy property, not an
 * oversight — this is a traffic counter, and "how many people came back this
 * month" is a question it should not be able to answer about an individual.
 *
 * Wrapped in try/catch because sessionStorage throws outright in some privacy
 * modes. When it does, each page load gets a fresh id and counts as its own
 * visit, which overstates visits for those visitors. That is the correct
 * failure direction: the alternative is dropping their traffic entirely.
 */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const created = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function endpoint() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? url + "/rest/v1/page_views" : null;
}

/**
 * Send whatever is queued. Emptied before the request goes out, not after it
 * succeeds — dropping is the honest failure for a metric nobody bills from.
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
    // The access token when there is one, so the viewer_id column default
    // resolves and the row is attributed; the anon key otherwise, which is what
    // a logged-out visitor sends and what leaves viewer_id NULL.
    //
    // getSession() reads local storage rather than calling the auth server:
    // this runs on a flush timer and must not add a round trip, and PostgREST
    // verifies the token at the other end regardless.
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
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });
  } catch {
    // Swallowed on purpose. See THE ONE RULE above.
  }
}

function attachListeners() {
  if (listenersAttached || typeof document === "undefined") return;

  listenersAttached = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  window.addEventListener("pagehide", () => flush());
}

/**
 * Record one navigation.
 *
 * PATHNAME ONLY — never the query string. `?returnTo=`, `?checkout=` and
 * whatever a future page adds can carry information about an individual, and a
 * traffic count has no business keeping it. The caller passes a pathname and
 * this does not go looking for more.
 */
export function recordPageView(path: string) {
  if (typeof window === "undefined") return;
  if (!path) return;

  attachListeners();

  queue.push({ path, session_id: sessionId() });

  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }

  // Timed from the FIRST view in the batch, not reset by each new one: a
  // visitor clicking steadily through the app would otherwise keep pushing the
  // deadline back and never flush until MAX_BATCH.
  if (!timer) {
    timer = setTimeout(flush, FLUSH_MS);
  }
}
