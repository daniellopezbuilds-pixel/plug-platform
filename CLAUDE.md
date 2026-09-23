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

### Embeds of `profiles` must name the foreign key

In a PostgREST select, never write a bare `profiles(...)`, `profiles!inner(...)`,
an alias such as `author:profiles(...)`, or a column hint such as
`profiles!submitted_by(...)`. Always name the constraint:

```
profiles!<table>_<column>_fkey(...)         e.g. profiles!applications_worker_id_fkey(full_name)
author:profiles!posts_author_id_fkey(...)   aliases keep the alias, add the name
profiles!employer_documents_user_id_fkey!inner(...)
```

The result key does not change (`profiles`, or the alias), so naming it is free.

**Why.** A bare embed has two ways to fail, and the app shows both as an
empty list with no error on screen:

1. **Two foreign keys to `profiles`** — PostgREST cannot choose, returns
   PGRST201, and the query gets no rows. Tables with two today: `reviews`,
   `connections`, `user_badges`, `user_badge_reviews`. Adding a second FK to
   any other table breaks every bare embed of it retroactively.
2. **No foreign key at all** — PGRST200, "Could not find a relationship".
   `jobs.user_id` has **no** FK to `profiles`, so `jobs ( profiles (...) )`
   has never resolved. Naming the constraint forces you to find it in the
   schema, which is where you discover it does not exist. Look the profile up
   by id in a second query instead (`hooks/useApplications.tsx`,
   `hooks/useProfileSummary.tsx`).

The error is invisible because `usePagedList` turns a failed query into an
empty list. Pages now render `ListError` when a list hook returns `error` —
any new list must do the same rather than checking only for emptiness.

**It has cost us twice so far:**

- **Admin Badge Requests queue showed "No licences awaiting review" with four
  queued.** `user_badges` has two FKs to `profiles` (`profile_id`,
  `reviewed_by`); the bare embed was ambiguous. Fixed with
  `profiles!user_badges_profile_id_fkey` in `hooks/useBadgeRequests.tsx`.
- **My Applications showed "No applications yet" beside tab counts reading
  7.** The list embedded `profiles` through `jobs`, which has no FK to
  `profiles`. The counts came from a separate query that worked, which is the
  only reason it was noticed. Broken from 2026-09-16 to 2026-09-23.

A third bug is often grouped with these but has a different cause: the
**ApplicationCard pay field** read the legacy free-text `jobs.pay` instead of
`formatPay()` (fixed in `6f2a5d3`). It is related only in that it shipped in
the same commit as the broken My Applications embed, so the fix was never
visible — the list it lived on never rendered.

Every `profiles` embed in `hooks/` was converted to the named form on
2026-09-23 and checked against staging. Find FK names with:

```
npx supabase db query --linked "select conrelid::regclass, conname from pg_constraint where contype='f' and confrelid='public.profiles'::regclass order by 1"
```

### Auth boundaries

`components/auth/AuthGuard.tsx` guards `/dashboard`, and it is **client-side
only** — a UX fix, not a security boundary. The boundary is RLS in Postgres.
Never gate anything on a client value alone, and never on `user_metadata`,
which is client-writable.

Moving to cookie-backed sessions via `@supabase/ssr` — which is what would make
a real server-side guard possible — is scoped but not started.

### Database

Schema changes are **not** made in the Supabase dashboard. Write a migration.
The three former hand-run files are folded into `supabase/migrations/`; the
originals are in `supabase/archive/`, kept for their reasoning and not re-run.
`supabase/README.md` holds the per-migration status — check it, and
`npm run db:status`, rather than assuming.

`docs/schema-inventory.md` is authoritative for columns and foreign keys; the
baseline is authoritative for everything else (defaults, CHECK constraints, RLS
policies, triggers, function bodies).

#### Two projects

| | Project ref |
|---|---|
| Production | `ztjlyucyoiagdwafgppf` |
| Staging | `fhdnzbuafxncbqpqovhx` — local dev points here |

**Staging is the default linked project.** Leave it that way.

#### Every schema change goes through this loop

```
1. write the migration in supabase/migrations/
2. npm run db:linked            # confirm STAGING is linked
3. npm run db:push              # -> staging
4. test locally against staging
5. npm run db:link:prod
6. npm run db:linked            # confirm PRODUCTION is linked
7. npm run db:push              # -> production
8. npm run db:link:staging      # link back, always
```

**Run `npm run db:linked` before every push, without exception.** It marks the
linked project. `db push` gives no second chance and no environment name in its
output — the only thing standing between a staging push and a production one is
which project happens to be linked, and that is invisible unless you look.

Step 8 is not optional tidying. The linked project persists across sessions in
`supabase/.temp/`, so skipping it leaves production linked and the *next*
change, possibly days later and by someone else, pushes straight to production
on what looks like a routine first push. `db:link:prod` prints a reminder on
success for that reason.

There is deliberately **no bare `db:link`**. It used to exist and it meant
production, which is the one target that should never be reachable by a command
that does not say so. Both link scripts name their environment; the project refs
live in `package.json` and nowhere else.

#### Two independent switches

Linking and `.env.local` are unrelated, and both point somewhere:

- `supabase link` decides where **migrations push**
- `NEXT_PUBLIC_SUPABASE_URL` / the keys in `.env.local` decide where the
  **running app reads and writes**

They can disagree, and nothing warns you. Changing one does not change the
other; `.env.local` should stay on staging even while you are briefly linked to
production for a push.

#### Dashboard settings do not transfer

Migrations carry schema. They do not carry project configuration, and the two
environments are deliberately different:

| | Staging | Production |
|---|---|---|
| Email confirmation | off | on |
| SMTP | none | Resend |

So a signup that completes instantly on staging will sit unconfirmed on
production, and anything email-dependent is effectively untested until it runs
there. Storage buckets, redirect URLs and auth provider config are the same kind
of thing — dashboard state, absent from version control, and per-project. See
"Bringing up a fresh project" in `supabase/README.md`.

### Reading this codebase

`docs/signup-and-brand-spec.md` section 0 and section 7 describe what actually
ships today, verified against the live database and the source. Read those
before designing against anything — several earlier drafts specified tables and
surfaces that do not exist.

 don't use Chrome browser
automation for verification. It's slow and expensive. Build,
typecheck, lint, and report — I test in the browser myself.

Add to CLAUDE.md: never use a bare profiles! embed in a
PostgREST query. Always name the constraint explicitly —
profiles!<table>_<column>_fkey — because a table with two FKs to
profiles will silently resolve to the wrong one and the error is
invisible.

This has now caused three bugs: My Applications showing empty
with correct counts, the admin Badge Requests queue showing
empty, and the ApplicationCard pay field. Record it as a
convention with those examples so it isn't rediscovered a fourth
time.