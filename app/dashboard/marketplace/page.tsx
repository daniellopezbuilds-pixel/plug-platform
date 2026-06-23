"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function MarketplacePage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfiles() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setProfiles(data);
      }

      setLoading(false);
    }

    loadProfiles();
  }, []);

  if (loading) {
    return <div>Loading profiles...</div>;
  }

  return (
    <div>
      <h1 className="text-5xl font-bold mb-8">
        Marketplace
      </h1>

      <div className="grid gap-6">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="border border-zinc-800 rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold">
              {profile.full_name || "Unnamed Worker"}
            </h2>

            <p className="text-gray-400 mt-2">
              @{profile.username || "no-username"}
            </p>

            <p className="mt-4">
              Trade: {profile.trade || "Not specified"}
            </p>

            <p className="mt-2 text-gray-300">
              {profile.bio || "No bio provided."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}