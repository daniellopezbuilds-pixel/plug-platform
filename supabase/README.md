# Database migrations

Until 2026-09-10 the schema lived only in the Supabase dashboard. Nothing about
it was in version control — no tables, no RLS policies, no signup trigger. The
baseline changed that.

The CLI is pinned as a devDependency (`supabase@2.117.0`), so use the `npm run
db:*` scripts rather than a globally installed `supabase`.

Project ref: `ztjlyucyoiagdwafgppf` (linked; `supabase/.temp/project-ref` is set)

---

## Status as of 2026-09-10

| | |
|---|---|
| Tooling | Done |
| Baseline captured | **Yes** — `migrations/20260908000000_remote_schema.sql`, 4821 lines |
| Baseline replayable as a migration | **No.** Raw `pg_dump`, not `db pull` output. See below |
| Signup migration written | Yes — `20260909120000_signup_roles_and_account_mode.sql` |
| Migration section 6 (signup trigger) | **Written.** Unblocked by the baseline |
| RLS conflict check vs baseline | **Done.** No conflicts. See "Conflict check" |
| Hand-run files folded in | Yes — see "Migration inventory" |
| Anything pushed to the live database | **No** |

---

## Migration inventory

| File | State | Notes |
|---|---|---|
| `20260908000000_remote_schema.sql` | Already applied (it *is* production) | Never push this at the live project |
| `20260909110000_branding_deals_columns.sql` | Already applied, except its comments | Records the hand-run branding-deals script |
| `20260909120000_signup_roles_and_account_mode.sql` | **Not applied** | The only file that changes anything |

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
- `ENABLE ROW LEVEL SECURITY` for every table that has it on
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

### What the baseline does not carry

Read this before ever running `db reset` against it.

1. **`\restrict` / `\unrestrict`.** Lines 5 and 4820 are psql meta-commands
   emitted by pg_dump 17.11. The CLI applies migrations over a Postgres
   connection, not through psql, so these are syntax errors. They must be
   stripped before the file can execute anywhere.
2. **`CREATE SCHEMA public` / `auth` / `storage`, and the managed schemas
   themselves** — 23 `auth` tables and 8 `storage` tables. Supabase's own
   bootstrap creates all of these. Replaying this file into a fresh project
   collides with it.
3. **Storage bucket rows.** `storage.buckets` contents are *data*, and this is a
   schema-only dump — zero `INSERT`/`COPY` statements in the file. The buckets
   `sponsored-listings`, `branding`, `resumes` and `employer-documents` would
   not exist after a reset, while every storage policy referencing them by
   `bucket_id` would. Uploads fail with the policies looking correct.
4. **Grants.** Zero `GRANT` statements — the dump was taken without privileges.
   Note that `20260909120000` ends with a `revoke`/`grant` pair on
   `role_credentials`; that one is in the migration and is unaffected.
5. **Extensions.** No `CREATE EXTENSION`. `gen_random_uuid()` is core in PG 17
   so the defaults still resolve, but nothing else is guaranteed.
6. **Column comments.** Only one public-schema comment survived
   (`profiles_guard_admin_escalation`). This is how we know the branding-deals
   comments were never applied.
7. **Not schema at all:** SMTP settings, email templates, redirect URLs, auth
   provider config. Relevant to the open email-deliverability item in spec
   section 7.6 — none of it is in version control and a reset would not restore
   it.

**The fix, when someone can run it:** a real `npm run db:pull`, which emits a
CLI-shaped migration without the meta-commands and managed-schema bootstrap.
Until then treat this file as documentation that happens to be valid SQL, and
seed the storage buckets by hand on any fresh project.

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
! npm run db:status        # compare local migrations against remote history
! npx supabase db push --dry-run
```

`db:status` should show `20260908000000` and `20260909110000` as applied on the
remote and `20260909120000` as pending. **If it does not**, do not push — the
first two are already in the live database and re-running them is not what you
want. Mark them applied without executing:

```
! npx supabase migration repair --status applied 20260908000000
! npx supabase migration repair --status applied 20260909110000
```

`20260909110000` is idempotent (`add column if not exists`, `drop policy if
exists`), so running it would in fact be harmless — but repairing is the honest
record. `20260908000000` must never be executed against the live project.

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
