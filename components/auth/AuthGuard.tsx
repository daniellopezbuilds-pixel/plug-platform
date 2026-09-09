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
 * WHAT THIS IS AND IS NOT
 *
 * This is a client-side guard. It runs in the browser, and a determined user
 * can bypass it with devtools. It is not the security boundary and must never
 * be treated as one — the boundary is RLS in Postgres, which is enforced on
 * every query regardless of what the browser believes.
 *
 * A server-side guard is not currently possible here: lib/supabase.tsx uses
 * plain createClient, so sessions live in localStorage rather than cookies and
 * never reach the server. Making a real proxy.ts guard possible means adopting
 * @supabase/ssr and moving to cookie-backed sessions. That is scoped as its
 * own piece of work.
 *
 * So what this actually buys: a logged-out or expired visitor lands on /login
 * with somewhere to go, instead of a dead page. That is a UX fix on top of an
 * enforced boundary, not a replacement for one.
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
