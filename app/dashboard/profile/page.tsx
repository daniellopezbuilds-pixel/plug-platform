"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [trade, setTrade] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log("CURRENT USER:", user);

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

      console.log("PROFILE FOUND:", profile);
      console.log("PROFILE ERROR:", profileError);

      if (!profile) {
        const insertResult = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            xp: 0,
          });

        console.log("INSERT RESULT:", insertResult);

        setLoading(false);
        return;
      }

      setProfileNumber(profile.profile_number || "");
      setFullName(profile.full_name || "");
      setUsername(profile.username || "");
      setTrade(profile.trade || "");
      setBio(profile.bio || "");

      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const result = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        trade,
        bio,
      })
      .eq("id", user.id)
      .select();

    console.log("UPDATE RESULT:", result);

    const { error } = result;

    if (error) {
      console.log("UPDATE ERROR:", error);
      alert(error.message);
      return;
    }

    alert("Profile updated successfully.");
  }

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-5xl font-bold mb-8 text-white">
        Edit Profile
      </h1>

      <div className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Profile Number
          </label>

          <div className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-yellow-400 font-semibold">
            {profileNumber}
          </div>
        </div>

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 h-40 text-white"
        />

        <button
          onClick={handleSave}
          className="bg-white text-black px-6 py-4 rounded font-semibold"
        >
          Save Profile
        </button>
      </div>
    </div>
  );
}