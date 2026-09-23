"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ProfileSummary = {
  id: string;
  full_name: string | null;
  company_logo_path: string | null;
  employer_verified: boolean | null;
  signup_type: string | null;
};

/**
 * Name, photo and verification for one profile — the employer behind a job.
 *
 * A LOOKUP BY ID, NOT AN EMBED. jobs.user_id has no foreign key to profiles,
 * so `jobs ( profiles (...) )` does not resolve in PostgREST; that embed is
 * what broke My Applications. See hooks/useApplications.tsx.
 *
 * Cached for the page's lifetime, because clicking through a list of jobs
 * from the same few employers would otherwise refetch the same row each time.
 */
const cache = new Map<string, ProfileSummary | null>();

export function useProfileSummary(profileId: string | null | undefined) {
  const [, rerender] = useState(0);

  useEffect(() => {
    if (!profileId || cache.has(profileId)) return;
    let cancelled = false;

    supabase
      .from("profiles")
      .select("id, full_name, company_logo_path, employer_verified, signup_type")
      .eq("id", profileId)
      .maybeSingle()
      .then(({ data }) => {
        cache.set(profileId, (data as ProfileSummary | null) ?? null);
        if (!cancelled) rerender((n) => n + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return profileId ? cache.get(profileId) ?? null : null;
}
