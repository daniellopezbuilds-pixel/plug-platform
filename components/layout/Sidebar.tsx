"use client";

import { NavLink } from "./NavLink";
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
  open,
  onClose,
}: {
  activeRole: string;
  signupType: string | null;
  modes: readonly Mode[];
  fullName: string;
  profileNumber: string;
  onSwitchRole: (mode: Mode) => void;
  onLogout: () => void;
  /** Drawer state. Ignored from md up, where the sidebar is always visible. */
  open: boolean;
  onClose: () => void;
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
    // Two layouts in one element.
    //
    // Under md it is an off-canvas drawer: fixed to the viewport, above the
    // overlay, slid out of frame by -translate-x-full until `open`. From md it
    // reverts to a static flex child (md:static md:translate-x-0) and the
    // drawer classes stop applying, so desktop is exactly as it was.
    //
    // overflow-y-auto so a tall sidebar (employer nav plus the mode switcher on
    // a short screen) scrolls inside itself rather than being clipped.
    <aside
      className={`w-64 shrink-0 h-full overflow-y-auto border-r border-zinc-800 p-6 flex flex-col grid-bg
        fixed inset-y-0 left-0 z-50 bg-black transition-transform duration-200 ease-out
        md:static md:z-auto md:translate-x-0 md:transition-none
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Drawer-only close control. The overlay behind it also closes, but a
          visible affordance matters when the drawer covers the whole screen. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        className="md:hidden absolute top-4 right-4 h-11 w-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-zinc-900 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div>
        <div className="flex items-start justify-between mb-10 pr-12 md:pr-0">
          <h1 className="text-3xl font-bold leading-tight">
            Sparx Plug
            <span className="block text-lg text-accent-2-soft">Ecosystem</span>
          </h1>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>

        <nav className="space-y-1 md:space-y-5">
          <NavLink href="/dashboard" exact onNavigate={onClose}>
            Dashboard
          </NavLink>
          {isBrand && (
            <NavLink href="/dashboard/branding-deals" onNavigate={onClose}>
              Branding deals
            </NavLink>
          )}
          <NavLink href="/dashboard/feed" onNavigate={onClose}>
            Feed
          </NavLink>
          <NavLink href="/dashboard/profile" onNavigate={onClose}>
            Profile
          </NavLink>
          <NavLink href="/dashboard/messages" onNavigate={onClose}>
            Messages
            {unreadCount > 0 && (
              <span className="bg-accent-2 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </NavLink>
          {!isBrand && (
            <NavLink href="/dashboard/requests" onNavigate={onClose}>
              Requests
            </NavLink>
          )}

          {!isBrand && activeRole === "worker" && (
            <>
              <NavLink href="/dashboard/jobs" onNavigate={onClose}>
                Jobs
              </NavLink>
              <NavLink href="/dashboard/applications" onNavigate={onClose}>
                Applications
              </NavLink>
              <NavLink href="/dashboard/marketplace" onNavigate={onClose}>
                My Local Network
              </NavLink>
            </>
          )}

          {!isBrand && activeRole === "employer" && (
            <>
              <NavLink href="/dashboard/jobs/create" onNavigate={onClose}>
                Post Job
              </NavLink>
              <NavLink href="/dashboard/applicants" onNavigate={onClose}>
                Applicants
              </NavLink>
              <NavLink href="/dashboard/marketplace" onNavigate={onClose}>
                My Local Network
              </NavLink>
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
        <button onClick={onLogout} className="flex items-center min-h-11 md:min-h-0 text-rose-400 hover:text-rose-300 transition">
          Logout
        </button>
      </div>
    </aside>
  );
}