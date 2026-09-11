import { createBrowserClient } from '@supabase/ssr'

/**
 * The browser Supabase client. One instance, imported by ~48 modules.
 *
 * COOKIE-BACKED SESSIONS
 *
 * This used to be plain `createClient` from @supabase/supabase-js, which kept
 * the session in localStorage. Three things followed from that, and all three
 * are now different:
 *
 *   1. The session is in cookies, so it reaches the server on every request.
 *      That is what makes proxy.ts a real guard rather than a UX nicety.
 *   2. `flowType` is 'pkce', not 'implicit'. createBrowserClient hardcodes it —
 *      it is not an option. Email links therefore arrive as ?code= or
 *      ?token_hash=, never as a #fragment. See app/auth/callback/route.tsx.
 *   3. The PKCE code verifier is a cookie too, which is the mechanical reason
 *      the callback route can complete the exchange server-side.
 *
 * WHAT DID NOT CHANGE, AND WHY NO CALLER NEEDED EDITING
 *
 * createBrowserClient returns a SupabaseClient, the same type as before, so
 * every .from(), .auth.*, .storage.* and .channel() call is untouched. It also
 * memoises internally when it detects a browser, so a module-scope export is
 * still exactly one client.
 *
 * SERVER RENDERING
 *
 * Every page in this app is a client component, but client components are
 * still server-rendered, so this module is evaluated on the server. That is
 * safe: with no cookie methods passed and no browser present, @supabase/ssr
 * gives the client an empty cookie reader, and only throws if something tries
 * to WRITE a session during prerender. Every auth call in this codebase is
 * inside a useEffect, so none do.
 *
 * It would stop being safe if a server component imported this, or imported one
 * of lib/ads.tsx, lib/branding.tsx, lib/employerDocuments.tsx or lib/resume.tsx,
 * which pull it in without a "use client" of their own. Use a request-scoped
 * createServerClient there instead.
 *
 * NOT AN XSS IMPROVEMENT
 *
 * The auth cookie cannot be httpOnly — this client has to read it — so it is
 * readable by script exactly as localStorage was. Cookies buy server-side
 * readability, not protection from XSS. RLS remains the security boundary.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * The localStorage key the old client stored its session under.
 *
 * Derived the same way supabase-js derives it — `sb-<first hostname label>-auth-token`
 * — so it matches whatever project .env.local points at. The cookie client
 * uses this same name for its cookie, which is why the legacy value is
 * invisible to it rather than merely stale: it looks for the name in
 * document.cookie and never in localStorage.
 *
 * Read by components/auth/LegacySessionMigration.tsx. Delete both once the
 * migration window has passed.
 */
export function legacySessionStorageKey(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null

  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  } catch {
    return null
  }
}
