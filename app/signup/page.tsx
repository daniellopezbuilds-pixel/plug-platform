"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("worker");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setSubmitting(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
      },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    alert("Account created. Please check your email to confirm your address.");
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-3">Sparx Plug Ecosystem</h1>
          <p className="text-gray-400">Connect. Build. Grow.</p>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="First Name"
              className="w-1/2 p-3 rounded bg-gray-900 border border-gray-700"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Last Name"
              className="w-1/2 p-3 rounded bg-gray-900 border border-gray-700"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 rounded bg-gray-900 border border-gray-700"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 rounded bg-gray-900 border border-gray-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="space-y-2">
            <p className="text-sm text-gray-400">I am signing up as:</p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole("worker")}
                className={`flex-1 p-3 rounded border ${
                  role === "worker"
                    ? "bg-white text-black border-white"
                    : "bg-gray-900 border-gray-700"
                }`}
              >
                Worker
              </button>

              <button
                type="button"
                onClick={() => setRole("employer")}
                className={`flex-1 p-3 rounded border ${
                  role === "employer"
                    ? "bg-white text-black border-white"
                    : "bg-gray-900 border-gray-700"
                }`}
              >
                Employer
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded p-3">
              {error}
            </p>
          )}

          <button
            onClick={handleSignup}
            disabled={submitting}
            className="w-full bg-white text-black p-3 rounded font-semibold hover:bg-gray-200 transition disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Create Account"}
          </button>
        </div>
      </div>
    </main>
  );
}