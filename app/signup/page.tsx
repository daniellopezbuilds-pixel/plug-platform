"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignup() {

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {

      if (data.user) {
        await supabase.from("profiles").insert([
          {
            id: data.user.id,
            email: email,
            xp: 0,
          },
        ]);
      }

      alert("Check your email to confirm signup.");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">

      <div className="w-full max-w-md space-y-4">

        <h1 className="text-4xl font-bold">
          Create Account
        </h1>

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

        <button
          onClick={handleSignup}
          className="w-full bg-white text-black p-3 rounded font-semibold"
        >
          Create Account
        </button>

      </div>

    </main>
  );
}