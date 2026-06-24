"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [role, setRole] = useState("");

  useEffect(() => {
    getRole();
  }, []);

  async function getRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (data) {
      setRole(data.role);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex">
      <aside className="w-64 border-r border-gray-800 p-6">
        <h1 className="text-3xl font-bold mb-10 leading-tight">
          Sparx Plug
          <span className="block text-lg text-yellow-400">
            Ecosystem
          </span>
        </h1>

        <nav className="space-y-5">
          <Link
            href="/dashboard"
            className="block hover:text-yellow-400"
          >
            Dashboard
          </Link>

          <Link
            href="/dashboard/profile"
            className="block hover:text-yellow-400"
          >
            Profile
          </Link>

          {role === "worker" && (
            <>
              <Link
                href="/dashboard/jobs"
                className="block hover:text-yellow-400"
              >
                Jobs
              </Link>

              <Link
                href="/dashboard/applications"
                className="block hover:text-yellow-400"
              >
                Applications
              </Link>

              <Link
                href="/dashboard/marketplace"
                className="block hover:text-yellow-400"
              >
                My Local Network
              </Link>
            </>
          )}

          {role === "employer" && (
            <>
              <Link
                href="/dashboard/jobs/create"
                className="block hover:text-yellow-400"
              >
                Post Job
              </Link>

              <Link
                href="/dashboard/applicants"
                className="block hover:text-yellow-400"
              >
                Applicants
              </Link>

              <Link
                href="/dashboard/marketplace"
                className="block hover:text-yellow-400"
              >
                My Local Network
              </Link>
            </>
          )}
        </nav>
      </aside>

      <section className="flex-1 p-10">
        {children}
      </section>
    </main>
  );
}