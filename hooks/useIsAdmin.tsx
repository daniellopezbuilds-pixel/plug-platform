"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Whether the signed-in user is a platform admin.
 *
 * WHAT THIS IS GOOD FOR
 *
 * Deciding what to render. It is a client-side read, so it can be forced true
 * in devtools and must not be the only thing between a user and an admin
 * action.
 *
 * It is, however, reading a value the user can no longer set. Until
 * 2026-09-09 the "Users can update own profile" RLS policy restricted rows but
 * not columns, so any signed-in user could set is_admin = true on themselves
 * from the browser console — which made this hook, and every is_admin() policy
 * in the database, meaningless. supabase/fix-admin-escalation.sql closed that
 * with a BEFORE UPDATE trigger on profiles.
 *
 * So is_admin is now a server-controlled value, and the admin tables
 * (employer_documents, sponsored_listings, general_requests) enforce it in
 * their own RLS policies. Those policies are the actual gate: a user who fakes
 * this hook sees the admin UI and every write they attempt is refused by
 * Postgres.
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;

      // Fail closed. An RLS denial or a network error is not evidence of
      // admin rights, and the previous version treated any error the same as
      // is_admin === false anyway — this just says so out loud and leaves a
      // trace when it happens.
      if (error) {
        console.error("Admin check failed:", error.message);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(profile?.is_admin === true);
      setLoading(false);
    }

    checkAdmin();

    return () => {
      active = false;
    };
  }, []);

  return { isAdmin, loading };
}
