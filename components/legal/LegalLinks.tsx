import Link from "next/link";

/**
 * The Privacy / Terms pair, for the bottom of the login and signup pages.
 *
 * Its own file rather than another export from LegalPage.tsx: login and signup
 * are client components, so anything they import is pulled into the client
 * bundle. LegalPage is only ever rendered by the two static server pages and
 * has no business travelling with them.
 *
 * Quieter than the "Sign up" / "Log in" line above it — these are the links you
 * want findable, not the ones you want clicked.
 */
export function LegalLinks() {
  return (
    <p className="text-center text-xs text-gray-500 mt-8">
      <Link href="/privacy" className="hover:text-gray-300 hover:underline transition">
        Privacy Policy
      </Link>
      <span className="mx-2" aria-hidden="true">
        ·
      </span>
      <Link href="/terms" className="hover:text-gray-300 hover:underline transition">
        Terms of Service
      </Link>
    </p>
  );
}
