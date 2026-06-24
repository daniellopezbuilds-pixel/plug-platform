"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("worker");

  async function handleSignup() {
    const { data, error } =
      await supabase.auth.signUp({
        email,
        password,
      });

    if (error) {
      alert(error.message);
      return;
    }

    if (data.user) {
      const profileNumber =
        role === "worker"
          ? `WRK-${Math.floor(
              100000 + Math.random() * 900000
            )}`
          : `EMP-${Math.floor(
              100000 + Math.random() * 900000
            )}`;

      await supabase.from("profiles").insert([
        {
          id: data.user.id,
          email,
          role,
          xp: 0,
          profile_number: profileNumber,
        },
      ]);
    }

    alert("Account created successfully.");
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-3">
            Sparx Plug Ecosystem
          </h1>

          <p className="text-gray-400">
            Connect. Build. Grow.
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 rounded bg-gray-900 border border-gray-700"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3 rounded bg-gray-900 border border-gray-700"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
          />

          <div className="space-y-2">
            <p className="text-sm text-gray-400">
              I am signing up as:
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setRole("worker")
                }
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
                onClick={() =>
                  setRole("employer")
                }
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

          <button
            onClick={handleSignup}
            className="w-full bg-white text-black p-3 rounded font-semibold hover:bg-gray-200 transition"
          >
            Create Account
          </button>
        </div>
      </div>
    </main>
  );
}