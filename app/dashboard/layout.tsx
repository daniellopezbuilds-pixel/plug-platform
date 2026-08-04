"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useActiveRole } from "@/hooks/useActiveRole";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { Sidebar } from "@/components/layout/Sidebar";

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
        fullName={profile.full_name || ""}
        profileNumber={profile.profile_number || ""}
        onSwitchRole={switchRole}
        onLogout={handleLogout}
      />
      <section className="flex-1 p-10">{children}</section>
    </main>
  );
}