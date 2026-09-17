"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEFAULT_AFTER_LOGIN, safeReturnTo } from "@/lib/returnTo";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { LegalLinks } from "@/components/legal/LegalLinks";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleLogin(e: React.FormEvent) {
    // A real submit, so the browser's own navigation has to be stopped.
    e.preventDefault();
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
    <AuthLayout>
      <>
        {/* bg-zinc-950/80 rather than solid: the accent washes behind the shell
            should read faintly through the card, or it sits on the background
            instead of in it. p-8 from sm — the card reads small on a wide
            screen at p-6, and the fields have not changed size. */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8">
          <h2 className="text-xl font-semibold mb-1">Log in</h2>
          <p className="text-sm text-gray-400 mb-6">
            Welcome back. Pick up where you left off.
          </p>

          {/* A real <form>, so Enter submits from ANY field.
              It used to be a bare <div> with an onKeyDown on the password
              input alone: Enter worked from the password box and did nothing
              from the email box, which is where people press it. A form also
              gets the Go key on mobile keyboards and gives password managers
              something to recognise. */}
          <form onSubmit={handleLogin} className="space-y-3">
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
              type="submit"
              disabled={submitting}
              className="w-full bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <ButtonSpinner active={submitting} />
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          <OrDivider />

          {/* Straight to /dashboard, not to /signup. A returning Google user has
              a signup_type already and should not detour through the signup
              form; a first-time one lands on the dashboard, fails the gate in
              app/dashboard/layout.tsx, and is sent to /signup to finish. One
              button, and the gate is what tells the two apart. */}
          <GoogleButton redirectPath="/dashboard" onError={setError} />
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-accent-2-soft hover:underline">
            Sign up
          </Link>
        </p>

        <LegalLinks />
      </>
    </AuthLayout>
  );
}
