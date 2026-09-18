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