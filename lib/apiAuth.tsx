import { createClient } from "@supabase/supabase-js";

/**
 * ============================================================================
 * CONVENTION: every route handler under app/api/ authenticates its caller.
 * ============================================================================
 *
 * Call getUserFromRequest(req) first, return 401 on null, and take the user id
 * and email FROM THE RETURNED USER — never from the request body.
 *
 *   export async function POST(req: NextRequest) {
 *     const user = await getUserFromRequest(req);
 *     if (!user) {
 *       return NextResponse.json({ error: "Not signed in." }, { status: 401 });
 *     }
 *     // ... use user.id, user.email
 *   }
 *
 * And from the browser:
 *
 *   const { data: { session } } = await supabase.auth.getSession();
 *   await fetch("/api/...", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${session.access_token}` },
 *   });
 *
 * WHY THIS IS A RULE AND NOT A SUGGESTION
 *
 * Everything under app/api/ is a public internet endpoint. A route that does not
 * check its caller has not been checked by anything: proxy.ts matches
 * /dashboard only, and deliberately — an API route is not a page and must not
 * depend on a matcher for its authentication.
 *
 * Both Stripe checkout routes were written without this and both were
 * exploitable: each took `userId` from the request body and trusted it, and
 * group-checkout took the PRICE from the body as well, so anyone could join a
 * paid group chat for one cent by editing a fetch.
 *
 * WHY THIS STAYS BEARER-BASED NOW THAT SESSIONS ARE COOKIES
 *
 * The original reason for the Authorization header was that there was no
 * alternative: sessions lived in localStorage, so nothing reached the server on
 * its own. That is no longer true — a route handler could now build a
 * createServerClient and read the session cookie. It should not, for two
 * reasons:
 *
 *   1. CSRF. The auth cookie cannot be httpOnly (the browser client has to read
 *      it) and is sameSite: lax, so it rides along on requests this app did not
 *      initiate. A bearer token has to be attached deliberately by code that
 *      already had it, which makes these routes structurally immune rather than
 *      conditionally safe. These routes create Stripe charges; "conditionally"
 *      is not good enough.
 *   2. The convention, the ESLint rule, its two opt-outs and "never take the id
 *      from the body" are settled and were paid for with two live bugs.
 *      Changing the mechanism reopens all of it for no gain.
 *
 * If cookie auth is ever genuinely wanted here, the shape is this function
 * falling back to a cookie-bound client when no Authorization header is
 * present — but answer the CSRF question first, in writing.
 *
 * ENFORCEMENT
 *
 * The `sparx/require-route-auth` ESLint rule in eslint.config.mjs fails the
 * build on any route.ts under app/api/ that exports an HTTP handler without
 * calling getUserFromRequest.
 *
 * A genuinely public route opts out with a `@public-route` comment naming what
 * protects it instead. Two exist: the Stripe webhook (verifies a Stripe
 * signature) and keep-alive (a cron ping taking no input). "It's only called
 * from our own frontend" is not a reason — that is exactly what the checkout
 * routes assumed.
 *
 * ----------------------------------------------------------------------------
 *
 * Verifies the caller's Supabase access token on a route handler.
 *
 * The token is sent explicitly rather than read from the session cookie — see
 * the CSRF reasoning above. getSession() is where the browser gets it from:
 *
 *   const { data: { session } } = await supabase.auth.getSession();
 *   fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
 *
 * Uses the anon key, not the service role: getUser(jwt) asks the auth server
 * to validate the token, which needs no elevated privilege. The service role
 * would work and would also mean a forged-token bug fails open against every
 * table, so it stays out of here.
 *
 * Returns null for a missing, malformed, expired or revoked token. Callers
 * must treat null as 401 and must take the user id and email from the
 * returned user — never from the request body.
 */
export async function getUserFromRequest(req: Request) {
  const header = req.headers.get("authorization");

  if (!header?.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;

  return data.user;
}
