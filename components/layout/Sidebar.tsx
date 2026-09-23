"use client";

import { NavLink } from "./NavLink";
import { RoleSwitch } from "./RoleSwitch";
import { NotificationBell } from "./NotificationBell";
import { useUnreadMessagesCount } from "@/hooks/useUnreadMessagesCount";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import type { Mode } from "@/lib/accountModes";
import { signupTypeLabel } from "@/lib/signupRoles";

/**
 * The count beside a nav item.
 *
 * NOTHING AT ZERO — not a dimmed "0", not an empty circle. A badge means
 * "there is something here"; one that is always present stops meaning anything
 * and the eye learns to skip it, which is the one thing a badge must not
 * teach.
 *
 * Caps at 9+ because the pill is a fixed 20px circle and three digits do not
 * fit. Past nine the exact number changes no decision anyway.
 */
function NavCount({ value }: { value: number }) {
  if (value <= 0) return null;

  return (
    <span
      className="bg-accent-2 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0"
      aria-label={`${value} unread`}
    >
      {value > 9 ? "9+" : value}
    </span>
  );
}

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
  /** Drawer state. Ignored from lg up, where the sidebar is always visible. */
  open: boolean;
  onClose: () => void;
}) {
  const unreadCount = useUnreadMessagesCount();
  const confirm = useConfirm();

  // Asked, not just done: a stray tap at the bottom of the drawer on a phone
  // used to sign someone out mid-task. Primary tone — it is not destructive,
  // and nothing is lost by it.
  async function handleLogout() {
    const ok = await confirm({
      title: "Log out of Sparx Plug?",
      body: "You will need your email and password to sign back in on this device.",
      confirmLabel: "Log out",
      tone: "primary",
    });
    if (ok) onLogout();
  }
  const sidebarCounts = useSidebarCounts();

  // Renders the Admin entry, and nothing else. This is a convenience, NOT a
  // boundary: the hook is a client-side read of is_admin and can be forced
  // true in devtools. /dashboard/admin checks it again, and every admin table
  // enforces is_admin in its own RLS, so a faked value buys the UI and no
  // writes. A hidden link was never what was protecting anything.
  //
  // `loading` is deliberately not used to reserve space. Until the check
  // resolves the entry is simply absent, which is what a non-admin sees
  // permanently — no placeholder, no flash of a disabled item.
  const { isAdmin } = useIsAdmin();

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
    // Under lg it is an off-canvas drawer: fixed to the viewport, above the
    // overlay, slid out of frame by -translate-x-full until `open`. From lg it
    // reverts to a static flex child (lg:static lg:translate-x-0) and the
    // drawer classes stop applying, so desktop is exactly as it was.
    //
    // THE ASIDE ITSELF DOES NOT SCROLL. It is a fixed-height column with three
    // bands: a pinned header, a scrolling nav, and a pinned footer. The footer
    // holds Logout, and Logout has to be reachable at every height.
    //
    // It used to be `overflow-y-auto` on the aside, which did scroll but put the
    // whole sidebar in one scrolling box. At 1024x768 — lg, so the full desktop
    // sidebar, in the shortest desktop viewport — the employer nav plus the mode
    // switcher overflows by about 80px, so Logout sat below the fold of a narrow
    // strip with no indication it was there. The scrollbar that appeared also ate
    // ~15px of the 208px content width, which is what made "Sparx Plug" wrap to
    // two lines at that size and not at 1440.
    //
    // Moving the overflow to the nav band fixes both: the footer is always on
    // screen, and the header never shares width with a scrollbar.
    <aside
      className={`w-64 shrink-0 h-full overflow-hidden border-r border-zinc-800 p-6 flex flex-col grid-bg
        fixed inset-y-0 left-0 z-50 bg-black transition-transform duration-200 ease-out
        lg:static lg:z-auto lg:translate-x-0 lg:transition-none
        ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      {/* Drawer-only close control. The overlay behind it also closes, but a
          visible affordance matters when the drawer covers the whole screen. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        className="lg:hidden absolute top-4 right-4 h-11 w-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-zinc-900 transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Pinned. Outside the scroll band so the wordmark never shares its
          width with a scrollbar. */}
      <div className="shrink-0">
        <div className="flex items-start justify-between mb-10 pr-12 lg:pr-0">
          {/* The logo, not an <h1>: every page has its own heading, and a
              second h1 in the sidebar made the outline start with the brand
              on every page. */}
          <Link href="/dashboard" onClick={onClose} className="rounded-lg" aria-label="Sparx Plug Ecosystem — dashboard">
            <BrandLogo size={36} eager />
          </Link>
          <div className="hidden lg:block">
            <NotificationBell />
          </div>
        </div>
      </div>

      {/* The one scrolling band.
          min-h-0: a flex item will not shrink below its content height without
          it, which would push the footer off the bottom again — the exact bug
          this is fixing.

          -mx-6 px-6: NavLink bleeds its active highlight to the sidebar edges
          with the same pair, which it can do inside the aside's p-6 but not
          inside a nested box that has no padding of its own. Setting overflow-y
          also makes overflow-x compute to auto rather than visible, so those
          24px turned into a horizontal scrollbar under the nav. Giving the band
          the same negative-margin-plus-padding puts the bleed back inside a
          padding box and the scrollbar goes away. */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-dark -mx-6 px-6">
        <nav className="space-y-1 lg:space-y-5">
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
            <NavCount value={unreadCount} />
          </NavLink>
          {!isBrand && (
            <NavLink href="/dashboard/requests" onNavigate={onClose}>
              Requests
              <NavCount value={sidebarCounts.requests} />
            </NavLink>
          )}

          {!isBrand && activeRole === "worker" && (
            <>
              <NavLink href="/dashboard/jobs" onNavigate={onClose}>
                Jobs
              </NavLink>
              <NavLink href="/dashboard/applications" onNavigate={onClose}>
                Applications
                <NavCount value={sidebarCounts.applications} />
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
                <NavCount value={sidebarCounts.applicants} />
              </NavLink>
              <NavLink href="/dashboard/marketplace" onNavigate={onClose}>
                My Local Network
              </NavLink>
            </>
          )}
        </nav>

        {/* Its own block below the nav rather than another item inside it, so
            it reads as a separate area. Same divider treatment as the mode
            switcher below, and the link itself is an ordinary NavLink, so the
            active bar and tint match every other entry.

            Outside <nav> rather than the last child of it because that list is
            `space-y-*`, and a wrapper with its own margin-top there would be
            fighting the generated one. */}
        {isAdmin && (
          <div className="mt-10 border-t border-zinc-800 pt-6">
            <NavLink href="/dashboard/admin" onNavigate={onClose}>
              Admin
            </NavLink>
          </div>
        )}

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

      {/* Pinned. The scrolling band above is flex-1, so this sits on the
          bottom edge without mt-auto doing the work. */}
      <div className="shrink-0 border-t border-zinc-800 mt-6 pt-6">
        <div className="mb-5">
          <p className="font-semibold">{fullName || "User"}</p>
          <p className="text-sm text-gray-400">
            {profileNumber || "SP-000000"}
            {/* Older accounts carry no signup_type — show the number alone
                rather than a trailing separator. */}
            {typeLabel && ` · ${typeLabel}`}
          </p>
        </div>
        <button onClick={handleLogout} className="flex items-center min-h-11 lg:min-h-0 text-rose-400 hover:text-rose-300 transition">
          Logout
        </button>
      </div>
    </aside>
  );
}