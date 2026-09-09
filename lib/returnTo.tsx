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
 * Only same-origin absolute paths are allowed through. Everything else falls
 * back to the dashboard:
 *
 *   "/dashboard/jobs?x=1"  -> allowed
 *   "https://evil.example" -> rejected, no leading slash
 *   "//evil.example"       -> rejected, protocol-relative URL
 *   "/\\evil.example"      -> rejected, backslash is treated as a slash by
 *                             some browsers
 *   "/login"               -> rejected, would bounce back here
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_LOGIN;

  if (!value.startsWith("/")) return DEFAULT_AFTER_LOGIN;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;

  // Sending someone back to an auth page after they just authenticated is a
  // loop, not a return.
  if (/^\/(login|signup|forgot-password|reset-password)(\/|\?|$)/.test(value)) {
    return DEFAULT_AFTER_LOGIN;
  }

  return value;
}
