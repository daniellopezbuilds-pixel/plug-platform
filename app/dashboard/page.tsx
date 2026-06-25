"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [completionPercentage, setCompletionPercentage] =
    useState(0);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!data) return;

    setProfile(data);

    let completed = 0;

    if (data.full_name) completed++;
    if (data.username) completed++;
    if (data.trade) completed++;
    if (data.bio) completed++;
    if (data.email) completed++;

    setCompletionPercentage(
      Math.round((completed / 5) * 100)
    );
  }

  if (!profile) {
    return (
      <div className="text-white">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-5xl font-bold mb-2">
        Welcome back,{" "}
        {profile.full_name || "User"} 👋
      </h1>

      <p className="text-gray-400 mb-10">
        {profile.profile_number} • {profile.role}
      </p>

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            XP Points
          </p>

          <h2 className="text-5xl font-bold text-yellow-400">
            {profile.xp || 0}
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Profile Completion
          </p>

          <h2 className="text-5xl font-bold">
            {completionPercentage}%
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Connections
          </p>

          <h2 className="text-5xl font-bold">
            0
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Applications
          </p>

          <h2 className="text-5xl font-bold">
            0
          </h2>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">
          Recent Activity
        </h2>

        <ul className="space-y-3 text-gray-300">
          <li>
            • Welcome to Sparx Plug Ecosystem.
          </li>

          <li>
            • Complete your profile to unlock
            more features.
          </li>

          <li>
            • Build your local network and start
            connecting.
          </li>
        </ul>
      </div>

      {/* Quick Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-2xl font-bold mb-4">
          Quick Actions
        </h2>

        <div className="flex flex-wrap gap-4">
          <Link
            href="/dashboard/profile"
            className="bg-white text-black px-5 py-3 rounded-lg font-semibold"
          >
            Complete Profile
          </Link>

          <Link
            href="/dashboard/jobs"
            className="border border-white px-5 py-3 rounded-lg"
          >
            Browse Jobs
          </Link>

          <Link
            href="/dashboard/marketplace"
            className="border border-white px-5 py-3 rounded-lg"
          >
            Grow Network
          </Link>
        </div>
      </div>
    </div>
  );
}