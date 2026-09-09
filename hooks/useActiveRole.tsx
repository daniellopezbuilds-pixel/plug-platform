"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Mode } from "@/lib/accountModes";

type Profile = {
  active_role: string;
  account_type: string | null;
  /**
   * From auth user_metadata, NOT from the profiles table.
   *
   * user_metadata is CLIENT-WRITABLE — any signed-in user can set this to any
   * value they like via supabase.auth.updateUser. It is a UI convenience for
   * choosing which nav to render and nothing more. Never gate anything
   * sensitive on it: no admin surface, no billing, no data access, no RLS
   * policy. Those must key off a server-controlled column on profiles.
   */
  signup_type: string | null;
  /**
   * signup_fields.brand_name from the same metadata. Readable only for the
   * signed-in user — other people's metadata is not exposed to the client, so
   * this cannot be used for directory listings.
   */
  brand_name: string | null;
  full_name: string | null;
  profile_number: string | null;
  username: string | null;
  trade: string | null;
  bio: string | null;
  email: string | null;
  xp: number | null;
};

/**
 * Every mounted copy of this hook shares mode changes.
 *
 * The dashboard layout and the dashboard page each call useActiveRole()
 * independently, so without this the sidebar's mode switcher would update the
 * layout's copy and leave the page's copy stale.
 */
const modeListeners = new Set<(mode: string) => void>();

/** Marks that the one-time active_role correction has run for this profile. */
const MODE_INIT_KEY = "sparx:mode-initialized:";

function hasInitialisedMode(userId: string) {
  try {
    return localStorage.getItem(MODE_INIT_KEY + userId) === "1";
  } catch {
    // Private mode or blocked storage: treat as already done rather than
    // re-correcting on every load and fighting the switcher.
    return true;
  }
}

function markModeInitialised(userId: string) {
  try {
    localStorage.setItem(MODE_INIT_KEY + userId, "1");
  } catch {
    /* nothing to do — see above */
  }
}

export function useActiveRole() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    const listener = (mode: string) =>
      setProfile((prev) => (prev ? { ...prev, active_role: mode } : prev));

    modeListeners.add(listener);
    return () => {
      modeListeners.delete(listener);
    };
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
      .select(
        "active_role, role, account_type, full_name, profile_number, username, trade, bio, email, xp"
      )
      .eq("id", user.id)
      .single();

    if (data) {
      let activeRole: string = data.active_role || "worker";

      // The signup trigger writes `role` from signup metadata but always sets
      // active_role to 'worker', so a C-10 lands in worker view. Correct the
      // starting mode from role and persist it.
      //
      // Once only, tracked in localStorage: after this runs, a disagreement
      // between role and active_role means the user chose a different mode
      // with the switcher, and overriding that would stop their choice from
      // ever sticking.
      if (!hasInitialisedMode(user.id)) {
        if (data.role && data.role !== activeRole) {
          activeRole = data.role;
          await supabase
            .from("profiles")
            .update({ active_role: activeRole })
            .eq("id", user.id);
        }
        markModeInitialised(user.id);
      }

      setProfile({
        active_role: activeRole,
        account_type: data.account_type,
        // Read off the auth user we already fetched above — no extra request.
        signup_type:
          typeof user.user_metadata?.signup_type === "string"
            ? user.user_metadata.signup_type
            : null,
        brand_name:
          typeof user.user_metadata?.signup_fields?.brand_name === "string"
            ? user.user_metadata.signup_fields.brand_name.trim() || null
            : null,
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

  // Still writes active_role. Once
  // 20260909120000_signup_roles_and_account_mode.sql is applied, this writes
  // active_mode instead and active_role is dropped. See spec section 2.
  async function switchRole(newRole: Mode) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not signed in" };

    const { error } = await supabase
      .from("profiles")
      .update({ active_role: newRole })
      .eq("id", user.id);

    if (error) return { error: error.message };

    // Notifies every mounted copy, including this one, so the sidebar and the
    // dashboard subtitle stay in step.
    modeListeners.forEach((listener) => listener(newRole));
    return { error: null };
  }

  return { profile, loading, switchRole, refresh: loadProfile };
}