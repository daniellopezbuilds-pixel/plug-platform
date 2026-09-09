"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, validatePassword } from "@/lib/passwords";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

/**
 * Change password, for a user who is already signed in.
 *
 * Requires the current password and verifies it before changing anything.
 * supabase.auth.updateUser({ password }) does NOT ask for the old one — it
 * trusts the session — so without this check a stolen or hijacked session is
 * enough to lock the real owner out of their account permanently. The
 * re-authentication is what makes the session alone insufficient.
 */
export function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function clearFeedback() {
    setError(null);
    setDone(false);
  }

  async function handleSubmit() {
    setError(null);
    setDone(false);

    if (!current) {
      setError("Please enter your current password.");
      return;
    }

    const invalid = validatePassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setSubmitting(false);
      setError("You are not signed in. Please log in again.");
      return;
    }

    // Re-authenticate with the current password. On success this issues a
    // fresh session for the same user, which is harmless; on failure the
    // existing session is left alone, so a wrong guess does not log the user
    // out of the page they are standing on.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });

    if (reauthError) {
      setSubmitting(false);
      // Specific here, unlike the login page: the account is already known to
      // exist and already signed in, so naming the wrong field reveals nothing
      // and saves the user guessing which of the three inputs was wrong.
      setError(
        /invalid login credentials/i.test(reauthError.message)
          ? "Current password is incorrect."
          : reauthError.message
      );
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setCurrent("");
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <div className="mt-10 border-t border-zinc-800 pt-8">
      <h2 className="text-xl font-bold text-white mb-1">Change password</h2>
      <p className="text-sm text-gray-400 mb-4">{PASSWORD_RULE}</p>

      <div className="space-y-3 max-w-md">
        <div>
          <label htmlFor="current-password" className={labelClass}>
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              clearFeedback();
            }}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="new-password" className={labelClass}>
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearFeedback();
            }}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className={labelClass}>
            Confirm new password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clearFeedback();
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

        {done && (
          <p className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-lg p-3">
            Password updated.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-accent text-on-accent px-5 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <ButtonSpinner active={submitting} />
          {submitting ? "Updating..." : "Update password"}
        </button>
      </div>
    </div>
  );
}
