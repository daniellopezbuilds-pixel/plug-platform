# Database migrations

Until 2026-09-10 the schema lived only in the Supabase dashboard. Nothing about
it was in version control — no tables, no RLS policies, no signup trigger. The
baseline changed that.

The CLI is pinned as a devDependency (`supabase@2.117.0`), so use the `npm run
db:*` scripts rather than a globally installed `supabase`.

Two projects. **Staging is the default linked project** — link back to it after
any production push. The full loop, and why step 8 matters, is in `CLAUDE.md`
under "Database".

| | Project ref |
|---|---|
| Production | `ztjlyucyoiagdwafgppf` |
| Staging | `fhdnzbuafxncbqpqovhx` — local dev points here |

`npm run db:linked` marks which one is currently linked. Run it before
every push; `db push` names no environment in its output.

---

## Status as of 2026-09-10

| | |
|---|---|
| Tooling | Done |
| Baseline captured | **Yes** — `migrations/20260908000000_remote_schema.sql`, 1701 lines |
| Baseline replayable as a migration | **Yes**, since the trim. See "Made replayable" |
| Migration section 6 (signup trigger) | **Written**, applied, and hotfixed. See the incident note |
| RLS conflict check vs baseline | **Done.** No conflicts. See "Conflict check" |
| Hand-run files folded in | Yes — see "Migration inventory" |
| Production | Migrations applied through `20260910120000` |
| Staging | Fresh project, being brought up. See "Bringing up a fresh project" |

---

## Migration inventory

| File | State | Notes |
|---|---|---|
| `20260908000000_remote_schema.sql` | Applied on production; runs for real on staging | Repair, never push, at production. See "Before pushing" |
| `20260909110000_branding_deals_columns.sql` | Already applied, except its comments | Records the hand-run branding-deals script |
| `20260909120000_signup_roles_and_account_mode.sql` | Applied 2026-09-10 | Broke signups; see the hotfix below |
| `20260910120000_fix_generate_profile_number_search_path.sql` | Run by hand during the incident | Idempotent — push it to record it |
| `20260910130000_pin_search_path_baseline_functions.sql` | **Not applied** | The other nine unpinned functions. Not urgent |

**Incident 2026-09-10.** `20260909120000` pinned `handle_new_user()` to an empty
`search_path`. Its own references were all qualified, but the
`set_profile_number` trigger it fires — `generate_profile_number()`, from the
baseline — has no pinned `search_path` and does `from profiles` unqualified. It
inherited the empty path, raised `42P01`, and every signup rolled back. Fixed by
pinning the callee.

Ten baseline functions had that shape in total (an earlier note here said nine —
that was a miscount). The other nine are pinned in `20260910130000`; none is
reachable from a signup, so that one is not urgent. All ten are `SECURITY
DEFINER`, so an unpinned `search_path` is a privilege-escalation shape in its own
right, not only a fragility.

**Watch for this pattern.** Pinning a caller to an empty `search_path` changes
name resolution for everything it calls. The error surfaces in the caller and
the cause is in the callee.

The three former hand-run scripts now live in `supabase/archive/`, each with a
header saying where its content went. They are kept for their reasoning, not to
be run.

- `fix-admin-escalation.sql` — applied 2026-09-09, fully present in the
  baseline (guard function, its comment, the `BEFORE UPDATE` trigger, and the
  replacement INSERT policy). No migration re-runs it.
- `branding-deals-setup.sql` — its DDL is in the baseline; only its `COMMENT`
  statements never reached the database, and those are in `20260909110000`.
- `pending.sql` — never applied, became `20260909120000`.

---

## The baseline: what it is, and what it is not

`20260908000000_remote_schema.sql` is a **raw `pg_dump`** of the whole database,
not the output of `supabase db pull`. That makes it an excellent record and a
poor migration.

### What it does contain

- 16 `public` tables — the 15 in spec section 0.1, plus the dead `workers` table
- 63 `CREATE POLICY` statements: 49 on `public.*`, 14 on `storage.objects`
- `ENABLE ROW LEVEL SECURITY` for all 16 `public` tables
- `handle_new_user()` and the `on_auth_user_created` trigger on `auth.users` —
  the item that blocked section 6 of the signup migration
- `is_admin()`, `can_message()`, `is_conversation_participant()`,
  `is_messaging_blocked()`, the notification functions, `generate_profile_number()`
- `profiles_guard_admin_escalation()` with its comment and trigger
- 15 `public` functions; 10 triggers on `public` tables plus the one on
  `auth.users`
- CHECK constraints, including three on `sponsored_listings` that spec section
  0.4 did not know about (`status`, `placement`, `payment_status` are all
  constrained, not free text)

### Made replayable 2026-09-10

The file began as a raw `pg_dump` and would not execute — a fresh staging
project failed on line 5 with `42601` at the `\restrict` meta-command. It has
since been trimmed, in place, to the 1701 lines that are actually ours:

**Removed** (260 sections): the `\restrict` / `\unrestrict` meta-commands;
`CREATE SCHEMA` for `auth`, `public` and `storage`; the `COMMENT ON SCHEMA
public`; and every `auth.*` and `storage.*` table, type, function, index,
constraint and comment. Supabase's own bootstrap creates all of it before
migrations run.

**Kept**: everything in `public`, unchanged — 16 tables, 15 functions, 49
policies, 9 triggers, all constraints and RLS. Plus three things that live in
Supabase's schemas but are ours: the 14 `storage.objects` policies, `CREATE
TRIGGER on_auth_user_created ON auth.users`, and the `profiles.id ->
auth.users(id)` foreign key.

The kept storage policies call `storage.foldername()`, `public.is_admin()` and
`public.can_message()`. The first is part of Supabase's storage bootstrap; the
other two are defined earlier in this same file.

### What `db push` may and may not do to Supabase-managed objects

The first attempt also kept `ALTER TABLE storage.objects ENABLE ROW LEVEL
SECURITY` and failed on it with `42501 must be owner of table objects`.
`storage.objects` is owned by `supabase_storage_admin`, and `ENABLE ROW LEVEL
SECURITY` strictly requires ownership. It was redundant anyway — Supabase
enables RLS on that table itself.

**`CREATE POLICY` on the same table is fine.** Supabase grants the `postgres`
role what it needs to manage policies there; that is what makes the dashboard
policy editor work for everyone. This is established empirically, not by
reading the docs: in the failed push the `ALTER` was statement 177 and the 14
storage policies were statements 163–176, so all of them executed before it.
The `auth.users` trigger and the `auth.users` foreign key sit far earlier in the
file and cleared too.

So the working rule for this project: **policies and triggers on Supabase-owned
tables push fine; `ALTER TABLE` against them does not.** Anything that changes
the table itself needs the dashboard or a support path.

Production already has this version recorded as applied and will never execute
it, so the edit is a no-op there.

### What the baseline still does not carry

1. **Storage bucket rows.** `storage.buckets` contents are *data*, and this is a
   schema-only dump — zero `INSERT`/`COPY` statements in the file. The buckets
   `sponsored-listings`, `branding`, `resumes` and `employer-documents` would
   not exist after a reset, while every storage policy referencing them by
   `bucket_id` would. Uploads fail with the policies looking correct.
2. **Grants.** Zero `GRANT` statements — the dump was taken without privileges.
   On a normal Supabase project this is fine: `ALTER DEFAULT PRIVILEGES` grants
   new `public` tables to `anon`, `authenticated` and `service_role`
   automatically. Verify it on any fresh project rather than assuming — see the
   staging checklist. Note that `20260909120000` ends with a `revoke`/`grant`
   pair on `role_credentials`; that one is in the migration and is unaffected.
3. **Extensions.** No `CREATE EXTENSION`. `gen_random_uuid()` is core from
   PG 13 on and the file uses it in 15 defaults, so it resolves on any current
   Supabase project, but nothing else is guaranteed.
4. **Column comments.** Only one public-schema comment survived
   (`profiles_guard_admin_escalation`). This is how we know the branding-deals
   comments were never applied.
5. **Not schema at all:** SMTP settings, email templates, redirect URLs, auth
   provider config. Relevant to the open email-deliverability item in spec
   section 7.6 — none of it is in version control and a reset would not restore
   it.

### Bringing up a fresh project

Migrations alone do not produce a working environment. After `db push`:

1. **Create the four storage buckets** — nothing in version control does this,
   and the policies reference them by `bucket_id`:

   | Bucket | Public reads |
   |---|---|
   | `sponsored-listings` | yes (`getAdPublicUrl` depends on it) |
   | `branding` | yes |
   | `resumes` | no |
   | `employer-documents` | no |

   Production has `file_size_limit = null` and `allowed_mime_types = any` on
   `sponsored-listings`; the 4:1 / 2MB rules in `lib/ads.tsx` are browser-side
   only. Match production, or tighten both at once.

2. **Confirm the table grants landed:**

   ```sql
   select has_table_privilege('authenticated', 'public.profiles', 'select') as auth_can_read,
          has_table_privilege('anon',          'public.jobs',     'select') as anon_can_read;
   ```

   Both false means default privileges are not configured and every request will
   fail on permissions rather than RLS — a confusing failure worth ruling out
   early.

3. **Configure auth separately:** SMTP, email templates, redirect URLs. None of
   it is in this directory.

---

## Conflict check — done 2026-09-10

The four dashboard queries this file used to list are all answered by the
baseline. Recording the answers so nobody runs them again:

| Question | Answer |
|---|---|
| Signup trigger body | Captured. `handle_new_user()`, `SECURITY DEFINER`, `search_path 'public'`. Inserts only `(id, email, full_name, role, xp)` |
| RLS policies | 63, all captured |
| Function collisions with the new migration | `is_admin` **exists**; `is_platform_admin`, `set_updated_at`, `role_credentials_touch_updated_at` do not |
| CHECK constraint on `profiles.account_type` | **None.** The section 4a backfill cannot fail on one |

Two consequences fed back into `20260909120000`:

- **`is_platform_admin()` is not created.** The baseline's `public.is_admin()`
  is an equivalent `SECURITY DEFINER` helper already referenced by roughly a
  dozen policies. `pending.sql` said to drop its own version if an equivalent
  turned up; it did.
- **`roles`, `account_roles`, `role_credentials` do not exist**, so their
  policies cannot collide with anything.

### Still worth doing, not done here

`public.is_admin()` is not marked `STABLE`, so it defaults to `VOLATILE` and may
be re-evaluated per row inside a policy. That is a planner cost, not a
correctness bug. Fixing it means `create or replace` on a function a dozen
policies depend on, which is not something to bundle into an unrelated
migration.

---

## Known risks before pushing

The two blocking risks are resolved. What is left:

1. **The signup trigger is rewritten, and untested.** Section 6 of
   `20260909120000` replaces `handle_new_user()`. There is no local database
   (no Docker), so it has never executed. Test one real signup immediately
   after pushing and confirm the new row has `account_type`, `active_mode`,
   `role`, `active_role`, and a matching `account_roles` row.
2. **Section 4b moves nobody.** `active_mode` is copied across from
   `active_role`, which is the same question under a new name, so no user
   changes dashboards when this lands. It is worth knowing that an earlier
   draft did the opposite — it set `active_mode` from `account_type` and would
   have pinned each account to one dashboard. If you are reading a stale copy
   of this migration, that is the difference to look for.
3. **The `'both'` backfill is the whole migration's correctness.** Every
   existing row has `account_type = 'both'` (the column default, never
   overwritten). `20260909120000` maps it by falling through to `role`. If
   `role` is ever null for a row, that row becomes `'individual'`. Worth a count
   before pushing:

   ```sql
   select account_type, role, count(*)
   from public.profiles
   group by 1, 2 order by 3 desc;
   ```

4. **`profiles.role` is load-bearing in an RLS policy.** Found in the baseline:
   `is_messaging_blocked()` reads it, and the "Participants can send messages"
   policy on `public.messages` calls that function. The follow-up migration that
   drops `role` has to rewrite the function in the same change, or message
   sending breaks at the database level. This is recorded in section 5 of the
   migration.

---

## Before pushing

```
! npm run db:linked             # WHICH PROJECT AM I LINKED TO
! npm run db:status             # local migrations vs that project's history
! npx supabase db push --dry-run
```

The baseline behaves in opposite ways on the two projects, so read `db:status`
against the environment you are actually pointed at:

**Production** already has `20260908000000` recorded as applied and **must never
execute it** — the tables are already there. If history is ever lost, repair it
rather than pushing it:

```
! npx supabase migration repair --status applied 20260908000000
```

**Staging** must execute it. That is why the file was trimmed to be replayable
(see "Made replayable" above). A fresh project runs the whole chain from
`20260908000000` forward.

A version marked applied that did not actually run is worse than either. That
happened on staging on 2026-09-10: history claimed all five migrations were
applied against an empty database. `db:status` looked healthy and nothing
existed. If the two ever disagree, trust the database — query for a table you
expect — and repair history to match it, not the reverse.

---

## Day-to-day

| Command | What it does |
|---|---|
| `npm run db:linked` | **Which project am I linked to.** Run before every push |
| `npm run db:link:staging` | Link to staging — the default, and where you link back to |
| `npm run db:link:prod` | Link to production, and print a reminder to link back |
| `npm run db:pull` | Pull remote schema changes into a new migration |
| `npm run db:diff -- -f <name>` | Generate a migration from local DB drift |
| `npm run db:push` | Apply pending migrations to **the linked project** |
| `npm run db:status` | Show applied vs pending migrations |
| `npm run db:lint` | Lint SQL (needs a local database) |

There is no bare `db:link`. It existed and meant production, which is the one
target that should never be reachable from a command that does not say so. The
project refs live in `package.json` and nowhere else.

`db:lint` and `supabase start` need Docker, which is not installed on this
machine. Without it, migrations in this directory are unexecuted SQL — review
them by reading, and push to a branch or staging project before production.

## Rule from here on

Schema changes stop being made in the dashboard. Dashboard edits are invisible
to this directory and will be silently reverted by the next `db push` that
recreates an object. Write a migration, or run `db:pull` immediately after so
the change is captured.
