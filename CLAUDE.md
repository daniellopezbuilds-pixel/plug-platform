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

`proxy.tsx` matches `/dashboard` only and must not be extended to cover
`app/api/` — a route that does not check its caller has not been checked by
anything, and authentication belongs in the handler rather than in a path
pattern a refactor can move out from under it. Both Stripe checkout routes were
written without this and both were exploitable.

Authentication here is by `Authorization: Bearer <access_token>`, **not** by the
session cookie, even though sessions are now cookie-backed and a handler could
read one. The cookie cannot be `httpOnly` and is `sameSite: lax`, so cookie auth
on routes that create Stripe charges would be conditionally safe against CSRF
where bearer tokens are structurally immune.

Enforced by the `sparx/require-route-auth` ESLint rule. A genuinely public
route opts out with a `@public-route` comment naming what protects it instead
(three today: the Stripe webhook, keep-alive, and `/auth/callback`). Full
rationale is in the header of `lib/apiAuth.tsx`.

### Auth boundaries

Sessions are cookie-backed via `@supabase/ssr` (`lib/supabase.tsx` uses
`createBrowserClient`). `flowType` is therefore `'pkce'` and **not
configurable**, so every emailed auth link lands on `app/auth/callback/route.tsx`
to be verified — there are no `#access_token` fragments any more.

Two guards, neither of them the boundary:

- **`proxy.tsx`** — server-side, 307s an unauthenticated visitor away from
  `/dashboard` before any HTML is sent, and additionally requires
  `profiles.is_admin` for `/dashboard/admin`. Cannot be bypassed from the
  browser.
- **`components/auth/AuthGuard.tsx`** — client-side, still needed for the cases
  that produce no request: mid-session expiry, cross-tab sign-out.

**The boundary is RLS in Postgres.** Every dashboard query still runs in the
browser; the proxy protects navigation, RLS protects data. Never gate anything
on a client value alone, and never on `user_metadata`, which is client-writable.

Cookies did not improve XSS exposure — the auth cookie is script-readable
exactly as localStorage was.

Anything written into `user_metadata` rides in the JWT, which rides in the
session cookie, which is sent on **every** request. Cap free-text fields that
reach it; see `maxLengthFor()` in `lib/signupRoles.tsx`.

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