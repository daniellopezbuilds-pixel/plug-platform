/**
 * `returnTo` handling for the login redirect.
 *
 * AuthGuard sends a logged-out visitor to /login?returnTo=<where they were>,
 * and the login page sends them back there afterwards.
 */

/** Where to send someone who has no business being sent anywhere specific. */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

/**
 * The current path plus its query string, ready to be put in ?returnTo=.
 *
 * Deliberately reads window.location rather than usePathname/useSearchParams:
 * useSearchParams forces a Suspense boundary and opts the page out of static
 * rendering, and every dashboard route is currently prerendered. Callers are
 * inside useEffect, so window is available.
 */
export function currentReturnTo(): string {
  return window.location.pathname + window.location.search;
}

/**
 * Validates a returnTo value before it is used as a redirect target.
 *
 * An unvalidated returnTo is an open redirect: /login?returnTo=https://evil.example
 * would bounce a freshly authenticated user off-site, which is a credible
 * phishing step because the link starts on our own domain.
 *
 * Only same-origin absolute paths are allowed through (see isSameOriginPath),
 * and not the auth pages themselves. Everything else falls back to the
 * dashboard:
 *
 *   "/dashboard/jobs?x=1"  -> allowed
 *   "https://evil.example" -> rejected, not a same-origin path
 *   "/login"               -> rejected, would bounce back here
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_LOGIN;

  if (!isSameOriginPath(value)) return DEFAULT_AFTER_LOGIN;

  // Sending someone back to an auth page after they just authenticated is a
  // loop, not a return.
  if (/^\/(login|signup|forgot-password|reset-password)(\/|\?|$)/.test(value)) {
    return DEFAULT_AFTER_LOGIN;
  }

  return value;
}

/**
 * The same validation for ?next= on /auth/callback, with one deliberate
 * difference: /reset-password is allowed.
 *
 * safeReturnTo rejects auth pages because bouncing a user who just logged in
 * back to a login form is a loop. But the recovery callback's entire purpose is
 * to land on /reset-password with a session in hand, so that exclusion is
 * wrong here — routing it to /dashboard instead would silently turn "set a new
 * password" into "you are now logged in", which is not what the user clicked.
 *
 * Still an allowlist rather than a free pass: only the auth destinations the
 * callback actually has a reason to send someone to. An open ?next= is an open
 * redirect whichever parameter name it hides behind.
 */
const CALLBACK_DESTINATIONS = /^\/(reset-password|dashboard)(\/|\?|$)/;

export function safeAuthNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_LOGIN;

  if (!isSameOriginPath(value)) return DEFAULT_AFTER_LOGIN;
  if (!CALLBACK_DESTINATIONS.test(value)) return DEFAULT_AFTER_LOGIN;

  return value;
}

/**
 * Shared shape check: an absolute same-origin path and nothing else.
 *
 *   "/dashboard/jobs?x=1"  -> true
 *   "https://evil.example" -> false, no leading slash
 *   "//evil.example"       -> false, protocol-relative URL
 *   "/\\evil.example"      -> false, backslash is treated as a slash by some
 *                            browsers
 */
function isSameOriginPath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;

  return true;
}
