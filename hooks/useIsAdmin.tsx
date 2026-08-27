"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      console.log("useIsAdmin: starting check");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      console.log("useIsAdmin: got user", user?.id, user?.email);

      if (!user) {
        console.log("useIsAdmin: no user, stopping");
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      console.log("useIsAdmin: profile result", profile, "error:", error);

      setIsAdmin(profile?.is_admin || false);
      setLoading(false);
    }

    checkAdmin();
  }, []);

  return { isAdmin, loading };
}