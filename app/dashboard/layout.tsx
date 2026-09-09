"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { availableModes } from "@/lib/accountModes";

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
    return <div className="min-h-screen bg-black text-white p-10">Loading...</div>;
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
    <main className="min-h-screen bg-black text-white flex ">
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
      />
      <section className="flex-1 p-10">{children}</section>
    </main>
  );
}
