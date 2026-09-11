"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEFAULT_AFTER_LOGIN, safeReturnTo } from "@/lib/returnTo";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

/**
 * Shown when app/auth/callback/route.tsx sends a dead link here — an expired
 * signup confirmation, or a stale email-change link. Without it those users land
 * on a bare login form with no idea why they were not signed in, which is the
 * dead end AuthGuard was built to remove from the dashboard.
 *
 * Deliberately vague about which link failed: the user has one, and "request a
 * new one" is the same answer either way.
 */
const LINK_INVALID_MESSAGE =
  "That link has expired or has already been used. Log in, or request a new one.";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error")) {
      setNotice(LINK_INVALID_MESSAGE);
    }
  }, []);

  /**
   * Where AuthGuard bounced this visitor from, if it did.
   *
   * Read at submit time rather than held in state: it is only ever needed
   * after a click, so there is nothing to synchronise on mount.
   *
   * window.location rather than useSearchParams, which would require a
   * Suspense boundary and opt this page out of static rendering — /login is
   * currently prerendered. Always passed through safeReturnTo, because an
   * unvalidated value here is an open redirect.
   */
  function afterLoginTarget() {
    if (typeof window === "undefined") return DEFAULT_AFTER_LOGIN;

    return safeReturnTo(
      new URLSearchParams(window.location.search).get("returnTo")
    );
  }

  async function handleLogin() {
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      // Supabase returns "Invalid login credentials" for a wrong password and
      // for an address that has no account. Say it plainly and don't leak
      // which of the two it was. Anything else — rate limits, unconfirmed
      // email, network — keeps its real message, which is the actionable one.
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? "Email or password is incorrect"
          : signInError.message
      );
      return;
    }

    router.push(afterLoginTarget());
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
          <h2 className="text-lg font-semibold mb-5">Log in</h2>

          {notice && (
            <p className="text-sm text-gray-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-5">
              {notice}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                className={inputClass}
              />
            </div>

            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-sm text-gray-400 hover:text-accent-2-soft hover:underline transition"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={submitting}
              className="w-full bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <ButtonSpinner active={submitting} />
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-accent-2-soft hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
