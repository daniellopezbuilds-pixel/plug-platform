"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentReturnTo } from "@/lib/returnTo";
import { ScreenLoader } from "@/components/ui/Loading";

/**
 * The single auth gate for /dashboard and everything under it.
 *
 * Before this existed there was no guard anywhere in the app — no middleware,
 * no proxy.ts, and no per-page check. Every hook did `if (!user) return;` and
 * gave up silently, so a logged-out visitor to /dashboard got
 * `app/dashboard/layout.tsx`'s "Loading..." branch forever, with no error and
 * no way back to login. Same for a session that expired mid-visit.
 *
 * NO LONGER THE ONLY GUARD, AND STILL NOT THE BOUNDARY
 *
 * proxy.ts now runs first and server-side: a visitor with no session cookie is
 * redirected to /login before any dashboard HTML is served, which is something
 * devtools cannot switch off. This component used to be the only thing standing
 * here, and it was bypassable.
 *
 * It is still not redundant, because the proxy only sees a request. These do
 * not produce one:
 *
 *   - a session that expires while the tab sits open
 *   - sign-out in another tab
 *   - a token revoked server-side mid-visit
 *
 * In all three the user is already past the proxy, looking at a rendered
 * dashboard, and only the onAuthStateChange listener below notices.
 *
 * Neither guard is the security boundary. That is RLS in Postgres, enforced on
 * every query regardless of what the browser believes. The proxy protects the
 * navigation; RLS protects the data.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;

    function toLogin() {
      if (!active) return;
      // replace, not push: the dashboard URL should not sit in history behind
      // the login page, or Back lands the user straight back on a page they
      // cannot see.
      window.location.replace(
        `/login?returnTo=${encodeURIComponent(currentReturnTo())}`
      );
    }

    async function check() {
      // getUser() rather than getSession(): getSession reads localStorage and
      // will happily hand back an expired or revoked token, which is exactly
      // the case this guard exists to catch. getUser validates against the
      // auth server.
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        toLogin();
        return;
      }

      setChecked(true);
    }

    check();

    // Catches expiry, sign-out, and sign-out in another tab, none of which
    // were observed anywhere in the app before — there was no
    // onAuthStateChange listener in the codebase at all, so a revoked session
    // sat there stale until a manual reload.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
          toLogin();
        }
      }
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Held deliberately until the check resolves, so no dashboard content or
  // query fires for someone who is about to be redirected.
  if (!checked) {
    return <ScreenLoader message="Checking your session" />;
  }

  return <>{children}</>;
}
