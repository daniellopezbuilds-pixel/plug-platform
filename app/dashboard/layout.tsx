"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Sidebar } from "@/components/layout/Sidebar";
import { availableModes } from "@/lib/accountModes";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  if (loading || !profile) {
    return <div className="min-h-screen bg-black text-white p-10">Loading...</div>;
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