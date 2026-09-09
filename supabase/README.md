# Database migrations

Until now the schema has lived only in the Supabase dashboard. Nothing about
it was in version control — no tables, no RLS policies, no signup trigger.
This directory is where that changes.

The CLI is pinned as a devDependency (`supabase@2.117.0`), so use the `npm run
db:*` scripts rather than a globally installed `supabase`.

Project ref: `ztjlyucyoiagdwafgppf`

---

## Status as of 2026-09-09

| | |
|---|---|
| Tooling | Done |
| Baseline captured | **No.** `supabase/.temp/` has no `project-ref`; no `*_remote_schema.sql` exists |
| Signup migration written | Yes — `20260909120000_...sql` |
| Migration structurally verified | Yes, against the live schema. See "Verification" below |
| Migration section 6 (signup trigger) | **Blocked.** Needs the current trigger body |
| RLS conflict check vs baseline | **Blocked.** Needs the baseline |

---

## Step 1 — capture the baseline (not done yet)

**This has to be run by a human.** `db pull` needs the database password, which
is not in `.env.local` and is not something the CLI can derive from the anon or
service-role keys. Linking also needs an interactive browser login.

From the Claude Code prompt, prefix with `!` so the output lands in the session:

```
! npx supabase login
! npm run db:link
! npm run db:pull
```

`db:link` will prompt for the database password (Supabase dashboard → Project
Settings → Database → Database password; reset it there if it was never saved).

`db:pull` writes `supabase/migrations/<timestamp>_remote_schema.sql` containing
the real current schema — tables, defaults, indexes, constraints, **RLS
policies, and the signup trigger**. Those last two are the reason this step
cannot be skipped or hand-written: a baseline that silently omits RLS is worse
than no baseline, because a future `db reset` would recreate the tables wide
open.

### Verifying the pull

`docs/schema-inventory.md` lists every table and column read directly off the
live database's PostgREST schema on 2026-09-09. Diff the pull against it. The
inventory is authoritative for **columns and foreign keys** and silent about
everything else, so:

- Columns or FKs in the pull that disagree with the inventory → something
  changed since 2026-09-09, or the pull hit the wrong project.
- Anything in the pull that the inventory does not mention (defaults, indexes,
  RLS policies, triggers, functions, storage policies) → expected. That is the
  material the inventory could not see.

Confirm the pull actually contains:

- [ ] the `auth.users` signup trigger and its function body
- [ ] `alter table ... enable row level security` for each table that has it on
- [ ] one `create policy` per policy currently in the dashboard
- [ ] storage bucket policies for `sponsored-listings`, `branding`, `resumes`

If any of those are missing, the pull did not capture what it needed to.
`db pull` covers the `public` schema by default; storage and auth objects may
need `--schema storage,auth` or a manual export.

### Fast path if `db pull` is a problem

The full pull is the right end state, but four queries in the dashboard SQL
editor unblock the two blocked items above without it. Paste the results back.

```sql
-- 1. The signup trigger and its function body.
--    Unblocks section 6 of the signup migration.
select t.tgname,
       pg_get_triggerdef(t.oid)     as trigger_def,
       pg_get_functiondef(t.tgfoid) as function_def
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- 2. Every RLS policy. Unblocks the conflict check.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 3. Functions the new migration could collide with.
--    Expect zero rows. Any row here needs a decision before pushing.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'is_platform_admin', 'set_updated_at',
                    'role_credentials_touch_updated_at', 'handle_new_user');

-- 4. CHECK constraints on profiles.
--    A constraint pinning account_type to 'worker'/'employer' would make the
--    section 4 backfill fail. See "Known risks" below.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'c';
```

---

## Verification — what has and has not been checked

Run against the live database on 2026-09-09 via the PostgREST schema. All
passed:

- `public.profiles` exists; `id` is `uuid`, matching the `uuid` FK columns in
  the three new tables
- `account_type`, `role`, `active_role` all exist, all `text`, all nullable —
  so the collapse is a re-value with a CHECK, and the backfill's `coalesce`
  is required rather than defensive
- `is_admin` exists and is `boolean` — `is_platform_admin()` depends on it
- `profiles.active_mode` does **not** exist — `add column` is safe
- `roles`, `account_roles`, `role_credentials` do **not** exist — `create
  table` is safe, and their RLS policies cannot conflict with anything,
  because the tables are new

**Not checked, because it needs the baseline:** whether any existing RLS policy
conflicts with the new ones, and whether the functions in query 3 above already
exist. The migration touches no existing policy — it only creates policies on
its own three new tables and alters columns on `profiles` — so a conflict would
have to come from a name collision, not from overlapping rules.

### Known risks before pushing

1. **The signup trigger (blocking).** Section 6 of the migration is a stub. The
   trigger writes `profiles.role` from signup metadata; with sections 1–5
   applied and the trigger unchanged, every new signup takes the
   `account_type` default of `'individual'` regardless of what the form sent.
   Existing rows stay correct; new ones silently do not.
2. **A CHECK constraint on `profiles.account_type`.** If one exists pinning it
   to `'worker'`/`'employer'`, the section 4a backfill fails outright. Loud,
   not silent — but it stops the migration. Query 4 tells you in advance.
3. **Function name collisions.** Mitigated: both new functions are namespaced
   and use `create`, not `create or replace`, so a collision aborts rather than
   redefining a function existing policies depend on.

---

## Step 2 — the signup migration (written, not applied)

`20260909120000_signup_roles_and_account_mode.sql`

Adds `roles`, `account_roles`, `role_credentials`; collapses
`role`/`account_type`/`active_role` into `account_type` + `active_mode`;
backfills from the existing columns; defines RLS for the three new tables.

**It is not ready to push.** Section 6 of the file is a blocked stub: the
signup trigger has to be rewritten as part of this change, and its current body
was not readable when the migration was written. Push before fixing that and
every new signup silently lands on the `account_type` default instead of what
the form submitted.

Ordering: migrations apply in filename order. This file is timestamped
`20260909120000` on the assumption the baseline pull sorts before it. If your
pull produced a later timestamp, rename this file.

### Before pushing

```
! npm run db:status        # compare local migrations against remote history
! npm run db:push --dry-run
```

---

## Day-to-day

| Command | What it does |
|---|---|
| `npm run db:pull` | Pull remote schema changes into a new migration |
| `npm run db:diff -- -f <name>` | Generate a migration from local DB drift |
| `npm run db:push` | Apply pending migrations to the linked project |
| `npm run db:status` | Show applied vs pending migrations |
| `npm run db:lint` | Lint SQL (needs a local database) |

`db:lint` and `supabase start` need Docker, which is not installed on this
machine. Without it, migrations in this directory are unexecuted SQL — review
them by reading, and push to a branch or staging project before production.

## Rule from here on

Schema changes stop being made in the dashboard. Dashboard edits are invisible
to this directory and will be silently reverted by the next `db push` that
recreates an object. Write a migration, or run `db:pull` immediately after so
the change is captured.
