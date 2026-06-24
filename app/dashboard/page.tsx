"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.push("/dashboard");
      }
    }

    checkUser();
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-6xl font-bold mb-6">
          Sparx Plug Ecosystem
        </h1>

        <p className="text-xl text-gray-400 mb-12">
          Connect. Build. Grow.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="bg-white text-black px-8 py-4 rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Login
          </Link>

          <Link
            href="/signup"
            className="border border-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-black transition"
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}