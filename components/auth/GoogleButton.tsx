"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

/**
 * "Continue with Google" — the same call for signing up and signing in.
 *
 * signInWithOAuth does not distinguish the two: a first-time Google user and a
 * returning one take an identical round trip and come back with a session
 * either way. What tells them apart is the dashboard gate — an account with no
 * signup_type gets sent to /signup to finish, everyone else carries on. That is
 * why this component has no "mode" prop and no separate login/signup variant.
 *
 * NO CALLBACK ROUTE IS INVOLVED. lib/supabase.tsx is a bare createClient, so
 * flowType is 'implicit' and the provider returns tokens in the URL FRAGMENT,
 * which never reaches the server — a route handler calling
 * exchangeCodeForSession would see nothing. detectSessionInUrl defaults to true,
 * so the client parses the fragment itself on whatever page it lands on, the
 * same way /reset-password already works. `redirectTo` therefore points at an
 * ordinary app page.
 *
 * The resulting absolute URL must be on the Redirect URLs allow list for the
 * Supabase project. When it is not, Supabase does not error — it silently sends
 * the user to the project's Site URL instead, which looks like a routing bug in
 * this app and is not one.
 */
export function GoogleButton({
  redirectPath,
  onError,
}: {
  /**
   * App-relative path to come back to, e.g. "/signup". Made absolute against
   * window.location.origin inside the click handler rather than by the caller:
   * both pages that use this prerender as static HTML, so reading `window`
   * during render would mean an SSR branch at every call site.
   */
  redirectPath: string;
  onError: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    });

    // Only reached when the redirect never happened. On success the browser has
    // already left the page, so there is no success branch and no setSubmitting
    // (false) — clearing it would flash the button back to its resting state
    // while the navigation is in flight.
    if (error) {
      setSubmitting(false);
      onError(error.message);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="w-full p-3 rounded-lg border border-zinc-700 text-white font-semibold hover:bg-zinc-900 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-11"
    >
      <ButtonSpinner active={submitting} />
      {!submitting && <GoogleMark />}
      {submitting ? "Redirecting..." : "Continue with Google"}
    </button>
  );
}

/**
 * Google's four-colour G, inline rather than an image so it needs no network
 * request and no new dependency. Fixed brand colours on purpose — this mark is
 * not themeable, and Google's branding terms require it be shown as-is.
 */
function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/** Shared "or" divider, so login and signup render it identically. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-4">
      <span className="h-px flex-1 bg-zinc-800" />
      <span className="text-xs text-gray-500">or</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}
