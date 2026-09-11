"use client";

import { useEffect } from "react";
import { supabase, legacySessionStorageKey } from "@/lib/supabase";
import { DEFAULT_AFTER_LOGIN, safeReturnTo } from "@/lib/returnTo";

/**
 * Carries a pre-migration session from localStorage into a cookie, once.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Sessions used to live in localStorage under `sb-<ref>-auth-token`. The cookie
 * client looks for that same name in document.cookie and nowhere else, so on
 * the deploy that swapped them, every signed-in user's session became invisible
 * — present on disk, never read — and they would all have been bounced to
 * /login to type a password again. This is the only part of the migration that
 * production users would otherwise feel.
 *
 * WHERE IT RUNS, AND WHY NOT IN AuthGuard
 *
 * Mounted in the root layout, because by the time AuthGuard could act it is too
 * late: proxy.ts sees no cookie, so a visit to /dashboard is redirected to
 * /login server-side before any dashboard component mounts. /login is where
 * these users actually land, so that is where this has to be able to run. The
 * root layout covers it and every other public page.
 *
 * WHEN IT REDIRECTS, AND WHEN IT DELIBERATELY DOES NOT
 *
 * Only when there is a ?returnTo= — i.e. a guard bounced them here — or when
 * they are sitting on the landing page, which app/page.tsx already sends signed-in
 * users away from. Someone who opened /login on purpose is left on the form: they
 * may be switching accounts, and yanking them to the dashboard because of a
 * session they were trying to leave behind would be a new and worse behaviour
 * than the one being fixed.
 *
 * DELETE THIS once the window has passed — it is dead weight after every active
 * browser has been through it once. Take legacySessionStorageKey() in
 * lib/supabase.tsx with it, and the mount in app/layout.tsx.
 */
export function LegacySessionMigration() {
  useEffect(() => {
    const key = legacySessionStorageKey();
    if (!key) return;

    let stored: string | null = null;

    // Wrapped because localStorage throws outright in some privacy modes rather
    // than returning null. Nothing here is important enough to break a page
    // render over — the fallback is the login form, which works.
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return;
    }

    // The overwhelmingly common case after the first week: nothing to do.
    if (!stored) return;

    /**
     * A cookie session already exists — they have signed in since the deploy, or
     * this already ran. Drop the stale copy and stop.
     *
     * Matches `key.` as well as `key=` because a session over ~3KB is split into
     * numbered chunk cookies (key.0, key.1) and the unchunked name is then
     * absent.
     */
    const cookies = document.cookie;
    if (cookies.includes(`${key}=`) || cookies.includes(`${key}.`)) {
      drop(key);
      return;
    }

    let session: { access_token?: string; refresh_token?: string } | null = null;

    try {
      session = JSON.parse(stored);
    } catch {
      drop(key);
      return;
    }

    const accessToken = session?.access_token;
    const refreshToken = session?.refresh_token;

    if (!accessToken || !refreshToken) {
      drop(key);
      return;
    }

    /**
     * setSession writes the cookies, refreshing first if the access token has
     * already expired — which it usually has, since these are by definition
     * sessions from before the deploy.
     *
     * An error here means the refresh token is spent or rotated out, and the
     * session was unrecoverable anyway. The key is dropped either way and the
     * user takes the login form, which is exactly what would have happened
     * without this component.
     */
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        drop(key);

        if (error) return;

        const { pathname, search } = window.location;

        if (pathname === "/login") {
          const returnTo = new URLSearchParams(search).get("returnTo");

          // No returnTo means they came to /login under their own steam. Leave
          // them alone; the session is live if they want it.
          if (returnTo) window.location.replace(safeReturnTo(returnTo));
          return;
        }

        // app/page.tsx sends signed-in visitors to the dashboard, but its
        // getUser() ran before this finished and saw nobody. Same destination,
        // arrived at a moment later.
        if (pathname === "/") {
          window.location.replace(DEFAULT_AFTER_LOGIN);
        }
      });
  }, []);

  return null;
}

function drop(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same reasoning as the read: a privacy mode that refuses storage is not
    // worth an exception. The session is already in a cookie by this point.
  }
}
