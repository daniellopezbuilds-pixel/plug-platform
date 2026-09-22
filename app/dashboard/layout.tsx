"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isOnboarded } from "@/lib/onboarding";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { NotificationToaster } from "@/components/layout/NotificationToaster";
import { availableModes } from "@/lib/accountModes";
import { ScreenLoader } from "@/components/ui/Loading";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // AuthGuard renders nothing until it has confirmed a live session, so
  // DashboardBody's hooks — and every query they fire — do not run for a
  // visitor who is about to be redirected to /login.
  return (
    <AuthGuard>
      <DashboardBody>{children}</DashboardBody>
    </AuthGuard>
  );
}

function DashboardBody({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { profile, loading, switchRole } = useActiveRole();
  const unreadCount = useUnreadMessagesCount();
  const [navOpen, setNavOpen] = useState(false);

  // Onboarding gate. Google authenticates without onboarding: the signup
  // trigger fires at the callback with metadata that has no signup_type, so the
  // account arrives here as account_type 'individual' / role 'worker' with no
  // account type of its own. Send it back to /signup to finish rather than
  // letting it sit in a dashboard that is quietly wrong about who it belongs to.
  //
  // In an effect, not during render — a router call during render is a React
  // error, and this only settles once `loading` is false.
  //
  // isOnboarded() is shared with /signup deliberately. That page redirects an
  // onboarded session here, so if the two ever disagreed about one account it
  // would bounce between them forever. Neither reimplements the check.
  const needsOnboarding = !loading && !!profile && !isOnboarded(profile.signup_type);

  useEffect(() => {
    if (needsOnboarding) router.replace("/signup");
  }, [needsOnboarding, router]);

  // Closing on navigation is handled by the nav links themselves (they call
  // onClose), not by watching the pathname here — an effect that setStates
  // synchronously on every route change is a cascading render.

  // Escape closes it too — the drawer covers the screen, and a keyboard or
  // external-keyboard user needs a way out that is not the overlay.
  useEffect(() => {
    if (!navOpen) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNavOpen(false);
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) Sparx Plug` : "Sparx Plug";

    return () => {
      document.title = "Sparx Plug";
    };
  }, [unreadCount]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return <ScreenLoader message="Loading your dashboard" />;
  }

  // Ordered after `loading` and before the `!profile` failure branch below on
  // purpose: a profile that exists but has no account type is not an error, and
  // showing the "we couldn't load your profile" screen to someone who simply
  // has not finished signing up would be wrong. Renders a loader rather than
  // the dashboard so no page query fires for someone about to leave — the same
  // reasoning as AuthGuard rendering nothing until its check resolves.
  if (needsOnboarding) {
    return <ScreenLoader message="Finishing your account setup" />;
  }

  // Past AuthGuard there is definitely a signed-in user, so a missing profile
  // is a real failure — an RLS denial, or an auth user with no profiles row —
  // not a loading state. This used to fall into the same `loading || !profile`
  // branch as the spinner and hang on "Loading..." with nothing logged.
  if (!profile) {
    return (
      <div className="min-h-screen bg-black text-white p-10">
        <h1 className="text-2xl font-bold mb-2">We couldn&apos;t load your profile</h1>
        <p className="text-gray-400 mb-6 text-sm">
          Your account is signed in, but its profile could not be read. Try
          reloading; if this keeps happening, contact support.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-accent text-on-accent px-5 py-2.5 rounded-lg font-semibold hover:bg-accent-hover transition"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="border border-zinc-700 text-gray-300 px-5 py-2.5 rounded-lg font-semibold hover:bg-zinc-900 transition"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    // h-screen + overflow-hidden, not min-h-screen: this pins the shell to the
    // viewport so the sidebar cannot scroll away with the content. The only
    // scroll container is the <section> below.
    // flex-col under lg so the top bar stacks above the content; flex-row from
    // lg, where the sidebar returns to being a static column beside it.
    <main className="h-screen overflow-hidden bg-black text-white flex flex-col lg:flex-row">
      <MobileTopBar onOpenNav={() => setNavOpen(true)} />

      {/* Tap-outside-to-close. Under the drawer (z-40 vs z-50) and only
          rendered while open, so it never intercepts taps on desktop. */}
      {navOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        activeRole={profile.active_role}
        signupType={profile.signup_type}
        modes={availableModes(profile.account_type)}
        // A brand is shown as its brand, not as the person managing it. The
        // contact name stays on the profile row for admin and messaging.
        fullName={
          (profile.signup_type === "brand" ? profile.brand_name : null) ||
          profile.full_name ||
          ""
        }
        profileNumber={profile.profile_number || ""}
        onSwitchRole={switchRole}
        onLogout={handleLogout}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      {/* The one scrolling region. Every dashboard page scrolls here, so no
          page needs its own scroll container. */}
      <section className="flex-1 overflow-y-auto scrollbar-dark">
        {/*
          Centred content column, applied once so no page carries its own
          wrapper.

          1600px, RAISED FROM 1200. At 1920 the shell spends 256px on the
          sidebar, leaving 1664 for this section; a 1200px cap left ~230px of
          dead space on each side, which read as sparse once there was real
          content in the pages rather than one or two rows. 1600 fills that
          with 32px of breathing room either side and still stops a 2560
          monitor from running text to the edges.

          WIDER IS NOT AUTOMATICALLY BETTER, and the cap alone does not make a
          page good. A single column stretched to 1500px reads worse than one
          at 700. Pages spend the extra width by adding columns — a rail, or
          more cards per row — and reading surfaces cap themselves through
          PageWithRail's `measure`. That component is where the decision lives.

          Padding is tighter under lg — a phone cannot spare 40px a side. The
          messages page sizes its chat panel against the VERTICAL padding here
          AND against the mobile top bar height; see lib/layout.tsx. px is free
          to change, py is not.
        */}
        {/* Renders nothing. Inside DashboardBody so it is past AuthGuard and
            therefore only ever mounted for a signed-in user. It and the bell
            both read useNotifications, which holds ONE fetch and ONE channel
            at module level for exactly this reason — see that hook. */}
        <NotificationToaster />

        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-10 lg:py-10">
          {children}
        </div>
      </section>
    </main>
  );
}
