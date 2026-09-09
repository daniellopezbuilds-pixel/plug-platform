"use client";

import Link from "next/link";
import { RoleSwitch } from "./RoleSwitch";
import { NotificationBell } from "./NotificationBell";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import type { Mode } from "@/lib/accountModes";
import { signupTypeLabel } from "@/lib/signupRoles";

export function Sidebar({
  activeRole,
  signupType,
  modes,
  fullName,
  profileNumber,
  onSwitchRole,
  onLogout,
}: {
  activeRole: string;
  signupType: string | null;
  modes: readonly Mode[];
  fullName: string;
  profileNumber: string;
  onSwitchRole: (mode: Mode) => void;
  onLogout: () => void;
}) {
  const unreadCount = useUnreadMessagesCount();

  // Brand accounts carry role 'employer' so the existing signup trigger works
  // unchanged, which means every activeRole branch below would otherwise show
  // them the employer nav. Gate on signup_type, not on role.
  const isBrand = signupType === "brand";

  // Same source as the dashboard header. Null for accounts predating the
  // current signup form, and for any unrecognised value.
  const typeLabel = signupTypeLabel(signupType);

  return (
    <aside className="w-64 border-r border-zinc-800 p-6 flex flex-col grid-bg">
      <div>
        <div className="flex items-start justify-between mb-10">
          <h1 className="text-3xl font-bold leading-tight">
            Sparx Plug
            <span className="block text-lg text-brand-soft">Ecosystem</span>
          </h1>
          <NotificationBell />
        </div>

        <nav className="space-y-5">
          <Link href="/dashboard" className="block hover:text-brand-soft transition">
            Dashboard
          </Link>
          {isBrand && (
            <Link
              href="/dashboard/branding-deals"
              className="block hover:text-brand-soft transition"
            >
              Branding deals
            </Link>
          )}
          <Link href="/dashboard/feed" className="block hover:text-brand-soft transition">
            Feed
          </Link>
          <Link href="/dashboard/profile" className="block hover:text-brand-soft transition">
            Profile
          </Link>
          <Link
            href="/dashboard/messages"
            className="flex items-center gap-2 hover:text-brand-soft transition"
          >
            Messages
            {unreadCount > 0 && (
              <span className="bg-zinc-700 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          {!isBrand && (
            <Link href="/dashboard/requests" className="block hover:text-brand-soft transition">
              Requests
            </Link>
          )}

          {!isBrand && activeRole === "worker" && (
            <>
              <Link href="/dashboard/jobs" className="block hover:text-brand-soft transition">
                Jobs
              </Link>
              <Link href="/dashboard/applications" className="block hover:text-brand-soft transition">
                Applications
              </Link>
              <Link href="/dashboard/marketplace" className="block hover:text-brand-soft transition">
                My Local Network
              </Link>
            </>
          )}

          {!isBrand && activeRole === "employer" && (
            <>
              <Link href="/dashboard/jobs/create" className="block hover:text-brand-soft transition">
                Post Job
              </Link>
              <Link href="/dashboard/applicants" className="block hover:text-brand-soft transition">
                Applicants
              </Link>
              <Link href="/dashboard/marketplace" className="block hover:text-brand-soft transition">
                My Local Network
              </Link>
            </>
          )}
        </nav>

        {!isBrand && modes.length > 1 && (
          <div className="mt-10 border-t border-zinc-800 pt-6">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Current mode</p>
            <RoleSwitch
              activeMode={activeRole}
              modes={modes}
              onSwitch={onSwitchRole}
            />
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-zinc-800 pt-6">
        <div className="mb-5">
          <p className="font-semibold">{fullName || "User"}</p>
          <p className="text-sm text-gray-400">
            {profileNumber || "SP-000000"}
            {/* Older accounts carry no signup_type — show the number alone
                rather than a trailing separator. */}
            {typeLabel && ` · ${typeLabel}`}
          </p>
        </div>
        <button onClick={onLogout} className="text-red-400 hover:text-red-300 transition">
          Logout
        </button>
      </div>
    </aside>
  );
}