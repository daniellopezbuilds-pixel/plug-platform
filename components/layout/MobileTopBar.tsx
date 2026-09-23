"use client";

import Link from "next/link";
import { NotificationBell } from "./NotificationBell";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * The mobile-only header: hamburger, logo, notification bell.
 *
 * Hidden from `md` up, where the sidebar is permanently visible and carries
 * the wordmark and bell itself.
 *
 * Not `position: sticky`. It is a non-scrolling flex row above the one scroll
 * container (the layout's `<section>`), which pins it to the top for free —
 * sticky would only matter if the whole page scrolled, which it does not.
 */
export function MobileTopBar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="lg:hidden shrink-0 h-14 flex items-center gap-3 px-4 border-b border-zinc-800 bg-black">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        // -ml-2.5 pulls the 44px target back so the icon still lines up with
        // the page padding rather than sitting inset from it.
        className="-ml-2.5 h-11 w-11 shrink-0 flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-zinc-900 transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <Link href="/dashboard" className="min-w-0 rounded-lg" aria-label="Sparx Plug Ecosystem — dashboard">
        <BrandLogo size={30} eager />
      </Link>

      <div className="ml-auto shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
}
