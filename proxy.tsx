import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * The server-side auth guard for /dashboard.
 *
 * Next 16 renamed middleware.ts to proxy.ts; the old name is deprecated. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * This is the first guard in this codebase that a browser cannot switch off.
 * It runs before any dashboard HTML is served, so a logged-out visitor gets a
 * 307 to /login and never receives the page. components/auth/AuthGuard.tsx
 * could always be stepped over in devtools; this cannot.
 *
 * It is still not the security boundary. Every dashboard page is a client
 * component that queries Supabase directly from the browser, so what protects
 * the DATA is RLS in Postgres, exactly as before. This protects the NAVIGATION.
 * Next's own guidance is the same: a proxy is for optimistic checks, not for
 * the last line of defence. See
 * node_modules/next/dist/docs/01-app/02-guides/data-security.md.
 *
 * It became possible only because sessions moved from localStorage to cookies
 * (lib/supabase.tsx). Nothing reached the server before that.
 */

/**
 * Paths this runs on.
 *
 * Deliberately narrow. A proxy runs on every matched request including
 * prefetches, and the admin branch below does a database read, so widening
 * this has a real cost. Public pages, /login, /signup, /reset-password and
 * /auth/callback must stay out of it — the callback in particular has no
 * session yet by definition, and guarding it would make email links
 * unusable.
 */
export const config = {
  matcher: ["/dashboard/:path*"],
};

/** The one prefix that additionally requires profiles.is_admin. */
const ADMIN_PREFIX = "/dashboard/admin";

export async function proxy(request: NextRequest) {
  /**
   * The response the Supabase client writes refreshed session cookies onto.
   *
   * Reassigned inside setAll, which looks odd but is the documented pattern: a
   * refresh has to be visible BOTH to the rest of this request (so the
   * database read below uses the new token) and to the browser (so it is not
   * asked to refresh again on the next request). Writing the cookie onto the
   * request and then rebuilding the response from it is what achieves both.
   */
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // Supabase hands these over whenever it writes auth cookies:
          // Cache-Control: private, no-store and friends. They are not
          // optional. A CDN that caches a response carrying a Set-Cookie for
          // one user's session will serve that session to the next visitor.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    }
  );

  /**
   * getClaims() rather than getUser().
   *
   * On a project using asymmetric JWT signing keys it verifies the token
   * locally against a cached JWKS — no network call per request. On the legacy
   * shared-secret (HS256) projects it falls back internally to getUser(), which
   * is a call to the auth server, so it is never less correct than getUser,
   * only sometimes faster. Migrating signing keys later makes this free with no
   * code change here.
   *
   * Either way it reads the cookie and refreshes an expired session through
   * setAll above, which is the other half of this function's job: without a
   * proxy, nothing server-side ever refreshes the token.
   */
  const { data, error } = await supabase.auth.getClaims();

  const claims = data?.claims;

  if (error || !claims?.sub) {
    return redirectToLogin(request, response);
  }

  if (request.nextUrl.pathname.startsWith(ADMIN_PREFIX)) {
    /**
     * The admin gate.
     *
     * One query, on one rarely-visited prefix. Next's guidance is to avoid
     * database reads in a proxy because it runs on prefetches too — which is
     * why this is inside the /dashboard/admin branch and not at the top of the
     * function.
     *
     * What it buys is UI integrity, not data safety. hooks/useIsAdmin.tsx is a
     * client read and can still be forced true in devtools, but the admin
     * tables (employer_documents, sponsored_listings, general_requests) enforce
     * is_admin in their own RLS, so a faked value never produced a successful
     * write. It did produce a rendered admin panel. This stops the page being
     * served at all.
     *
     * Trustworthy because is_admin is server-controlled: the BEFORE UPDATE
     * trigger on profiles (see the baseline migration, and
     * supabase/archive/fix-admin-escalation.sql for the reasoning) rejects a
     * non-admin changing it. Before that fix this read would have been
     * worthless.
     *
     * No service role here. The client is authenticated as the user by their
     * own cookie, and RLS lets a user read their own profile row.
     */
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", claims.sub)
      .maybeSingle();

    // Fail closed, and do not redirect to /login — this user is signed in
    // perfectly well, they are just not an admin, and bouncing them to a login
    // form would be a lie. The dashboard root is the honest destination.
    if (profileError || profile?.is_admin !== true) {
      return copyCookies(
        response,
        NextResponse.redirect(new URL("/dashboard", request.url))
      );
    }
  }

  return response;
}

/**
 * Same destination AuthGuard uses, so both guards behave identically and
 * /login keeps working the way it already does. The returnTo is read back
 * through safeReturnTo there, so this does not need to sanitise it — but it
 * only ever passes a pathname from the matched request, never anything a
 * caller supplied.
 */
function redirectToLogin(request: NextRequest, carrying: NextResponse) {
  const returnTo = request.nextUrl.pathname + request.nextUrl.search;

  const url = new URL("/login", request.url);
  url.searchParams.set("returnTo", returnTo);

  return copyCookies(carrying, NextResponse.redirect(url));
}

/**
 * Moves any cookies Supabase wrote during this request onto a different
 * response.
 *
 * Necessary because a redirect replaces the response object that setAll wrote
 * to. Dropping those cookies would throw away a token that was just refreshed,
 * and on the sign-out path would leave a cleared session looking live.
 */
function copyCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }

  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }

  return to;
}
