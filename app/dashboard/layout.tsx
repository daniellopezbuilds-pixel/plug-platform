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
  const [fullName, setFullName] = useState("");
  const [profileNumber, setProfileNumber] = useState("");

  useEffect(() => {
    getProfile();
  }, []);

  async function getProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("role, full_name, profile_number")
      .eq("id", user.id)
      .single();

    if (data) {
      setRole(data.role || "");
      setFullName(data.full_name || "");
      setProfileNumber(data.profile_number || "");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-black text-white flex">
      <aside className="w-64 border-r border-gray-800 p-6 flex flex-col">
        <div>
          <h1 className="text-3xl font-bold mb-10 leading-tight">
            Sparx Plug
            <span className="block text-lg text-yellow-400">
              Ecosystem
            </span>
          </h1>

          <nav className="space-y-5">
            <Link
              href="/dashboard"
              className="block hover:text-yellow-400 transition"
            >
              Dashboard
            </Link>

            <Link
              href="/dashboard/profile"
              className="block hover:text-yellow-400 transition"
            >
              Profile
            </Link>

            {role === "worker" && (
              <>
                <Link
                  href="/dashboard/jobs"
                  className="block hover:text-yellow-400 transition"
                >
                  Jobs
                </Link>

                <Link
                  href="/dashboard/applications"
                  className="block hover:text-yellow-400 transition"
                >
                  Applications
                </Link>

                <Link
                  href="/dashboard/marketplace"
                  className="block hover:text-yellow-400 transition"
                >
                  My Local Network
                </Link>
              </>
            )}

            {role === "employer" && (
              <>
                <Link
                  href="/dashboard/jobs/create"
                  className="block hover:text-yellow-400 transition"
                >
                  Post Job
                </Link>

                <Link
                  href="/dashboard/applicants"
                  className="block hover:text-yellow-400 transition"
                >
                  Applicants
                </Link>

                <Link
                  href="/dashboard/marketplace"
                  className="block hover:text-yellow-400 transition"
                >
                  My Local Network
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="mt-auto border-t border-gray-800 pt-6">
          <div className="mb-5">
            <p className="font-semibold">
              {fullName || "User"}
            </p>

            <p className="text-sm text-gray-400">
              {profileNumber || "SP-000000"}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="text-red-400 hover:text-red-300 transition"
          >
            Logout
          </button>
        </div>
      </aside>

      <section className="flex-1 p-10">
        {children}
      </section>
    </main>
  );
}