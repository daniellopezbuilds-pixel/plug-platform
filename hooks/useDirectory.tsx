"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type DirectoryProfile = {
  id: string;
  full_name: string | null;
  profile_number: string | null;
  trade: string | null;
  location: string | null;
  bio: string | null;
  union_status: string | null;
  union_verified: boolean | null;
  active_role: string | null;
  years_experience: number | null;
  resume_path: string | null;
  company_logo_path: string | null;
  company_description: string | null;
  company_website: string | null;
  employer_verified: boolean | null;
};

export function useDirectory() {
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");
  const [unionStatus, setUnionStatus] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, [trade, location, unionStatus]);

  async function loadProfiles() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let query = supabase
      .from("profiles")
      .select(
        "id, full_name, profile_number, trade, location, bio, union_status, union_verified, active_role, years_experience, resume_path, company_logo_path, company_description, company_website, employer_verified"
      );

    if (user) query = query.neq("id", user.id);
    if (trade.trim()) query = query.ilike("trade", `%${trade.trim()}%`);
    if (location.trim()) query = query.ilike("location", `%${location.trim()}%`);
    if (unionStatus) query = query.eq("union_status", unionStatus);

    const { data } = await query.order("created_at", { ascending: false });

    if (data) setProfiles(data as DirectoryProfile[]);
    setLoading(false);
  }

  return {
    profiles,
    loading,
    trade,
    setTrade,
    location,
    setLocation,
    unionStatus,
    setUnionStatus,
    refresh: loadProfiles,
  };
}