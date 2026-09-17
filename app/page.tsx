import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { MarketingIcon } from "@/components/marketing/MarketingIcon";
import { EntryGate } from "@/components/marketing/EntryGate";

export const metadata: Metadata = {
  title: "Sparx Plug Ecosystem",
  description: "Log in or create an account for the Sparx Plug Ecosystem.",
};

/**
 * The entry point to the app.
 *
 * THIS IS NOT A LANDING PAGE AND MUST NOT BECOME ONE. The marketing site lives
 * at sparxplug.com; this is ecosystem.sparxplug.com, where someone arrives
 * already intending to use the product. Its whole job is to identify the app
 * and route to log in or sign up. No hero, no feature grid, no benefit copy,
 * no product explanation — anything that sells belongs on the other domain.
 *
 * It shares AuthLayout with /login and /signup rather than composing its own
 * shell, so the wordmark does not move between the three pages a visitor sees
 * in a row. The brand statement, the two-column split and the accent washes are
 * all that component's; this file supplies only what goes in the right column.
 */
export default function HomePage() {
  return (
    <EntryGate>
      <AuthLayout>
        <>
          {/* Same card shell as the login and signup forms — this one holds two
              actions instead of fields, and is deliberately the same object. */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8">
            <h2 className="text-xl font-semibold mb-1">Get started</h2>
            <p className="text-sm text-gray-400 mb-6">
              Create an account, or log in if you already have one.
            </p>

            <div className="space-y-3">
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center gap-2 min-h-12 rounded-lg bg-accent text-on-accent font-semibold hover:bg-accent-hover transition"
              >
                Create account
                <MarketingIcon name="arrow" className="w-4 h-4" />
              </Link>

              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center min-h-12 rounded-lg border border-zinc-700 font-semibold hover:bg-zinc-900 hover:border-zinc-600 transition"
              >
                Log in
              </Link>
            </div>
          </div>

          {/* Orientation, one line. ecosystem.sparxplug.com is a different
              address from the marketing site, and someone who followed a link
              has nothing here confirming the two belong together. Says where
              they are and how to get back, and stops there. */}
          <p className="text-center text-sm text-gray-500 mt-6">
            This is the Sparx Plug Ecosystem app. Main site at{" "}
            <a
              href="https://sparxplug.com"
              className="text-accent-2-soft hover:underline"
            >
              sparxplug.com
            </a>
            .
          </p>

          <p className="mt-6 text-center text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition">
              Privacy Policy
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <Link href="/terms" className="hover:text-gray-300 transition">
              Terms of Service
            </Link>
          </p>
        </>
      </AuthLayout>
    </EntryGate>
  );
}
