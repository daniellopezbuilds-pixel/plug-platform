"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Holds the entry page back until we know whether the visitor is signed in.
 *
 * WHAT THIS FIXES. The redirect used to run alongside the page: an already
 * signed-in visitor hitting / saw "Create account" — the one action that does
 * not apply to them — for however long getUser() took, then got bounced to the
 * dashboard. Short, but it is the first thing the app ever showed them and it
 * was wrong.
 *
 * Three states, and only one of them renders anything:
 *
 *   checking   -> the holding shell. Also where a signed-in visitor STAYS,
 *                 because the redirect is already in flight and there is
 *                 nothing they should see here.
 *   signed out -> the page.
 *
 * WHY THE SHELL IS NOT AN EMPTY FRAGMENT. Returning null would unmount the only
 * element on the page carrying a background, and body's colour is
 * var(--foreground)'s partner — #ffffff under a light-mode OS. "Render nothing"
 * would flash white on exactly the machines least likely to be tested on. So
 * nothing is drawn, on a surface that matches what comes next.
 *
 * DO NOT PUT A SPINNER HERE. The blank beat before the panel appears is
 * deliberate. getUser() resolves fast enough that a loader would appear and
 * vanish in the same breath, and a flash of spinner reads worse than a moment
 * of nothing. AuthGuard's ScreenLoader is right where it is, on the dashboard,
 * because there is real work to wait on there — a profile query and the page
 * behind it. Here there is one token check and nothing to report on.
 */
export function EntryGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      // Deliberately no setState on the signed-in branch: leaving it in the
      // holding state is what stops the card appearing for a frame behind the
      // redirect. replace() rather than push() so / does not sit in history
      // between the dashboard and wherever they came from.
      if (user) {
        router.replace("/dashboard");
        return;
      }

      setSignedOut(true);
    }

    check();

    return () => {
      active = false;
    };
  }, [router]);

  if (!signedOut) return <div className="min-h-screen bg-black" />;

  return <>{children}</>;
}
