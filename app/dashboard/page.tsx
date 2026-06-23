"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
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

    loadProfile();
  }, []);

  return (
    <>
      <h1 className="text-5xl font-bold mb-4">
        Dashboard
      </h1>

      <p className="text-gray-400 mb-8">
        Welcome back.
      </p>

      <div className="border border-zinc-800 rounded-xl p-6 max-w-xl">
        <h2 className="text-3xl font-bold mb-4">
          Your Profile
        </h2>

        <div className="space-y-2">
          <p>
            <strong>Name:</strong>{" "}
            {profile?.full_name || "Not set"}
          </p>

          <p>
            <strong>Username:</strong>{" "}
            {profile?.username || "Not set"}
          </p>

          <p>
            <strong>Trade:</strong>{" "}
            {profile?.trade || "Not set"}
          </p>

          <p>
            <strong>Bio:</strong>{" "}
            {profile?.bio || "Not set"}
          </p>
        </div>
      </div>
    </>
  );
}