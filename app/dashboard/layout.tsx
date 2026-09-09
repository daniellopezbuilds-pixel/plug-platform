"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
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
  const { profile, loading, switchRole } = useActiveRole();
  const unreadCount = useUnreadMessagesCount();
  const [navOpen, setNavOpen] = useState(false);

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
    // flex-col under md so the top bar stacks above the content; flex-row from
    // md, where the sidebar returns to being a static column beside it.
    <main className="h-screen overflow-hidden bg-black text-white flex flex-col md:flex-row">
      <MobileTopBar onOpenNav={() => setNavOpen(true)} />

      {/* Tap-outside-to-close. Under the drawer (z-40 vs z-50) and only
          rendered while open, so it never intercepts taps on desktop. */}
      {navOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
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
      <section className="flex-1 overflow-y-auto">
        {/*
          Centred content column, applied once so no page carries its own
          wrapper.

          PAGE_MAX_WIDTH caps the line length on wide monitors — without it,
          content ran hard against the left edge with several hundred pixels of
          dead space on the right at 1920.

          Padding is tighter under md — 375px cannot spare 40px a side. The
          messages page sizes its chat panel against these numbers AND against
          the mobile top bar height; see lib/layout.tsx. Change either and
          change that.
        */}
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-10 md:py-10">
          {children}
        </div>
      </section>
    </main>
  );
}
