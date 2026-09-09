"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

/** Seconds the button stays disabled after a submit. */
const COOLDOWN_SECONDS = 60;

/**
 * The one thing this page ever says back.
 *
 * Identical whether the address has an account, has no account, or the request
 * failed outright. Anything that varies by whether the email is registered
 * turns this form into an account-existence oracle — the same reason
 * app/login/page.tsx collapses Supabase's credential errors into one message.
 */
const SENT_MESSAGE = "If that email is registered, we've sent a reset link.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Kept in a ref so the countdown can be cleared on unmount without the
  // interval id becoming render state.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS);

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCooldown((seconds) => {
        if (seconds <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  async function handleSubmit() {
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    setSubmitting(false);

    // The result is deliberately not shown to the user. resetPasswordForEmail
    // does not distinguish a real address from an unknown one, but it does
    // surface rate limits, and reporting those back would still leak timing
    // information about which addresses are being retried. Log it and say the
    // same sentence either way.
    if (resetError) {
      console.error("Password reset request failed:", resetError.message);
    }

    setSent(true);

    // The cooldown starts on any submit, successful or not. Starting it only
    // on success would leave the button live exactly when a script is
    // hammering the endpoint.
    //
    // This is a client-side limit and trivially bypassed by calling the API
    // directly — it exists to stop accidental repeat submits and casual abuse
    // from the form. Supabase's own server-side rate limit is the real one.
    startCooldown();
  }

  const disabled = submitting || cooldown > 0;

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
          <h2 className="text-lg font-semibold mb-1">Reset your password</h2>
          <p className="text-sm text-gray-400 mb-5">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>

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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !disabled) handleSubmit();
                }}
                className={inputClass}
              />
            </div>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
                {error}
              </p>
            )}

            {sent && !error && (
              <div>
                <p className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-lg p-3">
                  {SENT_MESSAGE}
                </p>
                {/* The sending domain is new and shares history with another
                    sender, so Gmail is filing these as spam. Muted and below
                    the confirmation on purpose — it is a hint for the person
                    who comes back confused, not a warning. Remove it once
                    domain reputation settles. */}
                <p className="text-xs text-gray-500 mt-2">
                  If you don&apos;t see it, check your spam folder.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled}
              className="w-full bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <ButtonSpinner active={submitting} />
              {submitting
              ? "Sending..."
              : cooldown > 0
              ? `Resend in ${cooldown}s`
              : sent
              ? "Resend link"
              : "Send reset link"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          Remembered it?{" "}
          <Link href="/login" className="text-accent-2-soft hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
