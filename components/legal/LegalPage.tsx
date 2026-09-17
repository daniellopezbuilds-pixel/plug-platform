import Link from "next/link";
import { LEGAL_UPDATED } from "@/lib/legal";

/**
 * Shell for /privacy and /terms.
 *
 * Server components, no "use client" and no auth: both pages must be readable
 * by a logged-out visitor and by Google's OAuth verification reviewers, which
 * means they also need to prerender as static HTML. Nothing in here may reach
 * for supabase, a hook, or the session.
 *
 * The prose classes are written out rather than coming from a typography
 * plugin, because the project does not have one installed.
 */

/** One numbered-feeling block: a heading and its body. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

/** Body copy. The one place the paragraph styling is decided. */
export function LegalText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 leading-relaxed">{children}</p>;
}

/** Bulleted list, styled to match LegalText. */
export function LegalList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-400 leading-relaxed marker:text-zinc-600">
      {children}
    </ul>
  );
}

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  /** One line under the heading saying what the document is for. */
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-accent-2-soft transition"
          >
            Sparx Plug <span className="text-accent-2-soft">Ecosystem</span>
          </Link>

          <h1 className="text-3xl font-bold mt-6">{title}</h1>

          <p className="text-sm text-gray-400 mt-2">{summary}</p>

          <p className="text-xs text-gray-500 mt-4">
            Last updated {LEGAL_UPDATED}
          </p>
        </header>

        <div className="space-y-8">{children}</div>

        <footer className="mt-12 pt-6 border-t border-zinc-800 flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-400">
          <Link href="/privacy" className="hover:text-accent-2-soft transition">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-accent-2-soft transition">
            Terms of Service
          </Link>
          <Link href="/login" className="hover:text-accent-2-soft transition">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-accent-2-soft transition">
            Sign up
          </Link>
        </footer>
      </div>
    </main>
  );
}
