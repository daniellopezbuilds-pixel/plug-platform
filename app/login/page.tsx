"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      alert(error.message);
    } else {
      alert("Login successful.");
      router.push("/dashboard");
    }
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

          <button
            onClick={handleLogin}
            className="w-full bg-white text-black p-3 rounded font-semibold hover:bg-gray-200 transition"
          >
            Login
          </button>
        </div>
      </div>
    </main>
  );
}