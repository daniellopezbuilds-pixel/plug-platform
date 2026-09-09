"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-brand focus:outline-none transition";

const labelClass = "block text-sm text-gray-400 mb-1";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">
            Sparx Plug <span className="text-brand-soft">Ecosystem</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Connect. Build. Grow.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-lg font-semibold mb-5">Log in</h2>

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

            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg p-3">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={submitting}
              className="w-full bg-brand text-white p-3 rounded-lg font-semibold hover:bg-brand-soft transition disabled:opacity-50"
            >
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand-soft hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
