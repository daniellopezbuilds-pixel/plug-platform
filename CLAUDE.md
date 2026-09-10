@AGENTS.md

# Project context

Platform for the electrical trade — permits, jobs, CE, and brand advertising.

## Active work
Signup revision + Brand accounts. Spec: @docs/signup-and-brand-spec.md

## Conventions

**Stack.** Next 16 App Router (`app/`), React 19, Tailwind v4, Supabase,
Stripe. Components in `components/`, data hooks in `hooks/`, shared logic in
`lib/`. Files use `.tsx` throughout, including ones with no JSX.

**Verify with** `npx tsc --noEmit` and `npx eslint app components hooks lib`,
then `npx next build`. There is no test suite. Lint has a standing baseline of
pre-existing errors — compare counts before and after rather than expecting
zero.

### API routes must authenticate their caller

Every route handler under `app/api/` calls `getUserFromRequest(req)` from
`lib/apiAuth.tsx` first, returns 401 on null, and takes the user id and email
**from the returned user, never from the request body**.

There is no `proxy.ts`, and sessions live in localStorage rather than cookies,
so nothing reaches the server on its own — a route that does not check its
caller has not been checked by anything. Both Stripe checkout routes were
written without this and both were exploitable.

Enforced by the `sparx/require-route-auth` ESLint rule. A genuinely public
route opts out with a `@public-route` comment naming what protects it instead.
Full rationale is in the header of `lib/apiAuth.tsx`.

### Auth boundaries

`components/auth/AuthGuard.tsx` guards `/dashboard`, and it is **client-side
only** — a UX fix, not a security boundary. The boundary is RLS in Postgres.
Never gate anything on a client value alone, and never on `user_metadata`,
which is client-writable.

Moving to cookie-backed sessions via `@supabase/ssr` — which is what would make
a real server-side guard possible — is scoped but not started.

### Database

Schema changes are **not** made in the Supabase dashboard. The baseline landed
2026-09-10 and the three former hand-run files are folded into
`supabase/migrations/`; the originals are in `supabase/archive/`, kept for their
reasoning and not to be re-run. Only
`20260909120000_signup_roles_and_account_mode.sql` is unapplied.

Read `supabase/README.md` before pushing anything — the baseline is a raw
`pg_dump`, not `db pull` output, so it is a faithful record but not a replayable
migration, and it does not carry storage bucket rows, grants or extensions.

`docs/schema-inventory.md` is authoritative for columns and foreign keys; the
baseline is authoritative for everything else (defaults, CHECK constraints, RLS
policies, triggers, function bodies).

### Reading this codebase

`docs/signup-and-brand-spec.md` section 0 and section 7 describe what actually
ships today, verified against the live database and the source. Read those
before designing against anything — several earlier drafts specified tables and
surfaces that do not exist.