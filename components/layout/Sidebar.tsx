"use client";

import Link from "next/link";
import { RoleSwitch } from "./RoleSwitch";
import { NotificationBell } from "./NotificationBell";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";

export function Sidebar({
  activeRole,
  fullName,
  profileNumber,
  onSwitchRole,
  onLogout,
}: {
  activeRole: string;
  fullName: string;
  profileNumber: string;
  onSwitchRole: (role: "worker" | "employer") => void;
  onLogout: () => void;
}) {
  const unreadCount = useUnreadMessagesCount();

  return (
    <aside className="w-64 border-r border-zinc-800 p-6 flex flex-col grid-bg">
      <div>
        <div className="flex items-start justify-between mb-10">
          <h1 className="text-3xl font-bold leading-tight">
            Sparx Plug
            <span className="block text-lg text-yellow-400">Ecosystem</span>
          </h1>
          <NotificationBell />
        </div>

        <nav className="space-y-5">
          <Link href="/dashboard" className="block hover:text-yellow-400 transition">
            Dashboard
          </Link>
          <Link href="/dashboard/profile" className="block hover:text-yellow-400 transition">
            Profile
          </Link>
          <Link
            href="/dashboard/messages"
            className="flex items-center gap-2 hover:text-yellow-400 transition"
          >
            Messages
            {unreadCount > 0 && (
              <span className="bg-yellow-400 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          {activeRole === "worker" && (
            <>
              <Link href="/dashboard/jobs" className="block hover:text-yellow-400 transition">
                Jobs
              </Link>
              <Link href="/dashboard/applications" className="block hover:text-yellow-400 transition">
                Applications
              </Link>
              <Link href="/dashboard/marketplace" className="block hover:text-yellow-400 transition">
                My Local Network
              </Link>
            </>
          )}

          {activeRole === "employer" && (
            <>
              <Link href="/dashboard/jobs/create" className="block hover:text-yellow-400 transition">
                Post Job
              </Link>
              <Link href="/dashboard/applicants" className="block hover:text-yellow-400 transition">
                Applicants
              </Link>
              <Link href="/dashboard/marketplace" className="block hover:text-yellow-400 transition">
                My Local Network
              </Link>
            </>
          )}
        </nav>

        <div className="mt-10 border-t border-zinc-800 pt-6">
          <p className="text-sm text-gray-400 mb-3">Current Mode</p>
          <RoleSwitch activeRole={activeRole} onSwitch={onSwitchRole} />
        </div>
      </div>

      <div className="mt-auto border-t border-zinc-800 pt-6">
        <div className="mb-5">
          <p className="font-semibold">{fullName || "User"}</p>
          <p className="text-sm text-gray-400">{profileNumber || "SP-000000"}</p>
        </div>
        <button onClick={onLogout} className="text-red-400 hover:text-red-300 transition">
          Logout
        </button>
      </div>
    </aside>
  );
}