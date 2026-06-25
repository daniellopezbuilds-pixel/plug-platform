"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);

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

    setProfile(data);
  }

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-5xl font-bold mb-3">
          Welcome back,
          {" "}
          {profile?.full_name || "User"} 👋
        </h1>

        <p className="text-gray-400 text-lg">
          {profile?.profile_number}
          {" • "}
          {profile?.role}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            XP Points
          </p>

          <h2 className="text-4xl font-bold text-yellow-400">
            {profile?.xp || 0}
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Profile Completion
          </p>

          <h2 className="text-4xl font-bold">
            70%
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Connections
          </p>

          <h2 className="text-4xl font-bold">
            0
          </h2>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <p className="text-gray-400 mb-2">
            Applications
          </p>

          <h2 className="text-4xl font-bold">
            0
          </h2>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <h2 className="text-2xl font-bold mb-6">
          Recent Activity
        </h2>

        <div className="space-y-3 text-gray-400">
          <p>• Welcome to Sparx Plug Ecosystem.</p>
          <p>• Complete your profile to unlock more features.</p>
          <p>• Build your local network and start connecting.</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <h2 className="text-2xl font-bold mb-6">
          Quick Actions
        </h2>

        <div className="flex flex-wrap gap-4">
          <button className="bg-white text-black px-6 py-3 rounded-lg font-semibold">
            Complete Profile
          </button>

          <button className="border border-white px-6 py-3 rounded-lg">
            Browse Jobs
          </button>

          <button className="border border-white px-6 py-3 rounded-lg">
            Grow Network
          </button>
        </div>
      </div>
    </div>
  );
}