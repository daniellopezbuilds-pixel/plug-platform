"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  active_role: string;
  full_name: string | null;
  profile_number: string | null;
  username: string | null;
  trade: string | null;
  bio: string | null;
  email: string | null;
  xp: number | null;
};

export function useActiveRole() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("active_role, full_name, profile_number, username, trade, bio, email, xp")
      .eq("id", user.id)
      .single();

    if (data) {
      setProfile({
        active_role: data.active_role || "worker",
        full_name: data.full_name,
        profile_number: data.profile_number,
        username: data.username,
        trade: data.trade,
        bio: data.bio,
        email: data.email,
        xp: data.xp,
      });
    }

    setLoading(false);
  }

  async function switchRole(newRole: "worker" | "employer") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not signed in" };

    const { error } = await supabase
      .from("profiles")
      .update({ active_role: newRole })
      .eq("id", user.id);

    if (error) return { error: error.message };

    setProfile((prev) => (prev ? { ...prev, active_role: newRole } : prev));
    return { error: null };
  }

  return { profile, loading, switchRole, refresh: loadProfile };
}