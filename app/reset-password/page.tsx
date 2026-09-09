"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, validatePassword } from "@/lib/passwords";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

/**
 * How long to wait for a recovery session before calling the link dead.
 *
 * The client parses the recovery token out of the URL asynchronously as it
 * initialises (detectSessionInUrl), and that can finish after this component
 * mounts. Deciding too early would show "link expired" on a link that was
 * about to work.
 */
const SESSION_SETTLE_MS = 2500;

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Establishing the recovery session.
   *
   * The reset link lands here as a URL fragment, not a query string:
   * lib/supabase.tsx uses plain createClient, whose default flowType is
   * 'implicit', so the token arrives as #access_token=...&type=recovery rather
   * than as ?code=. There is nothing to exchange — the client picks the
   * fragment up itself. (Moving to @supabase/ssr would switch this to PKCE and
   * a ?code= exchange; this page would need rewriting at that point.)
   *
   * Three ways this resolves, and all three have to be handled or the page
   * goes blank on a bad link:
   *
   *   1. onAuthStateChange fires with a session — the normal path.
   *   2. getSession() already has one, because the client finished parsing
   *      before this effect ran. Subscribing alone would miss this and hang.
   *   3. Neither happens inside SESSION_SETTLE_MS — expired link, already-used
   *      link, or someone opening /reset-password directly.
   */
  useEffect(() => {
    let settled = false;

    // Read before anything else: the client strips the fragment once it has
    // parsed it. On failure Supabase sends #error=access_denied&
    // error_code=otp_expired&error_description=..., which is the difference
    // between "this link is expired" and "we have no idea what happened".
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );
    const linkError = params.get("error_description");

    function markReady() {
      if (settled) return;
      settled = true;
      setStatus("ready");
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Guarded on session rather than the event name: INITIAL_SESSION fires
        // immediately with null, and treating that as an answer would race the
        // fragment parse.
        if (session) markReady();
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setStatus("invalid");
      if (linkError) setError(linkError);
    }, SESSION_SETTLE_MS);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit() {
    setError(null);

    const invalid = validatePassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (updateError) {
      // A recovery token that was already spent fails here rather than at
      // session setup, so this path needs the same dead-link treatment as the
      // timeout above — otherwise the user is left staring at a raw
      // "Auth session missing!" with nowhere to go.
      if (/session|token|expired|jwt/i.test(updateError.message)) {
        setStatus("invalid");
        setError(null);
        return;
      }

      // Everything else — most usefully "New password should be different
      // from the old password" — is actionable, so it is shown as-is.
      setError(updateError.message);
      return;
    }

    // updateUser leaves the recovery session in place as a normal one, so the
    // user is already signed in at this point.
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">
            Sparx Plug <span className="text-accent-2-soft">Ecosystem</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Connect. Build. Grow.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          {status === "checking" && (
            <>
              <h2 className="text-lg font-semibold mb-1">Checking your link</h2>
              <p className="text-sm text-gray-400">One moment...</p>
            </>
          )}

          {status === "invalid" && (
            <>
              <h2 className="text-lg font-semibold mb-1">This link has expired</h2>
              <p className="text-sm text-gray-400 mb-5">
                Password reset links can only be used once, and they expire after
                a while. Request a new one and it&apos;ll work.
              </p>

              {error && (
                <p className="text-sm text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-5">
                  {error}
                </p>
              )}

              <Link
                href="/forgot-password"
                className="block w-full text-center bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition"
              >
                Request a new link
              </Link>
            </>
          )}

          {status === "ready" && (
            <>
              <h2 className="text-lg font-semibold mb-1">Set a new password</h2>
              <p className="text-sm text-gray-400 mb-5">{PASSWORD_RULE}</p>

              <div className="space-y-3">
                <div>
                  <label htmlFor="password" className={labelClass}>
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="confirm" className={labelClass}>
                    Confirm new password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save new password"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          <Link href="/login" className="text-accent-2-soft hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
