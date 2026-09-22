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

## Status as of 2026-09-22

| | |
|---|---|
| Tooling | Done |
| Baseline captured | **Yes** — `migrations/20260908000000_remote_schema.sql`, 1701 lines |
| Baseline replayable as a migration | **Yes**, since the trim. See "Made replayable" |
| Migration section 6 (signup trigger) | **Written**, applied, and hotfixed. See the incident note |
| RLS conflict check vs baseline | **Done.** No conflicts. See "Conflict check" |
| Hand-run files folded in | Yes — see "Migration inventory" |
| Production | **Fourteen migrations applied**, through `20260918120000`. The nine CSLB and badge files have not been pushed here |
| Staging | **Fully up to date** — everything through `20260922150000` applied |
| CSLB licence data | **Staging: imported on 2026-09-22**, 244,519 rows as of the 2026-09-19 file, all classifications, `c10_count` 29,123. Verified afterwards: licence 1117700 returns `wrong_classification` with `{C36}`. **Production: not checked from here**, and it has none of the CSLB migrations anyway. It is data, not schema, and does not travel on a `db push` — see "Importing the CSLB file" |
| CSLB import shape | **Every classification**, since `20260922120000`. 244,519 rows: the 29,123 C-10s in full, the rest slim. A project imported before that migration holds C-10s only and answers `not_found` for everything else — re-import it |

---

## Migration inventory

| File | State | Notes |
|---|---|---|
| `20260908000000_remote_schema.sql` | Applied on both | Repair, never push, at production — it is a dump of production. See "Before pushing" |
| `20260909110000_branding_deals_columns.sql` | Applied on both | Records the hand-run branding-deals script. Its `COMMENT` statements were the part that never reached the database by hand; they have landed with the migration |
| `20260909120000_signup_roles_and_account_mode.sql` | Applied 2026-09-10 | Broke signups; see the hotfix below |
| `20260910120000_fix_generate_profile_number_search_path.sql` | Applied | Run by hand during the incident, and recorded in the ledger since. Idempotent |
| `20260910130000_pin_search_path_baseline_functions.sql` | Applied | The other nine unpinned functions |
| `20260915120000_ad_payment_columns.sql` | Applied | `duration_months` + `stripe_session_id` on `sponsored_listings`, for the brand ad checkout. Fully additive |
| `20260916120000_ad_events.sql` | Applied | New `ad_events` table — impression/click capture. New table only, touches nothing existing |
| `20260916130000_badges.sql` | Applied | Badge system v1. Adds `profiles.signup_type`, `badges`, `user_badges`, `user_badge_reviews`, the `public_badges` view. Rewrote `handle_new_user()`. Backfilled the first 100 accounts and folded `employer_verified` into `business_verified`. **Created `badges` without an `icon` column** — see `20260916140000` |
| `20260916140000_badge_icons.sql` | Applied | `badges.icon` plus the glyph names for the three seeded badges. The app selects `badges.icon`, so this had to land before the code shipped — it did |
| `20260917120000_role_credentials_verification_guards.sql` | Applied 2026-09-17 | Two BEFORE triggers on `role_credentials`. UPDATE: changing `fields` clears `verified`/`verified_at`, so a verified flag cannot outlive the values it was granted against. INSERT: a non-admin may not create an already-verified row — the RLS policy gates rows, not columns, and INSERT was never column-granted the way UPDATE was. Tested against staging before the production push; see "Credential verification guards" |
| `20260917130000_page_views.sql` | Applied 2026-09-17 | New `page_views` table (first-party traffic capture, written by `lib/pageViews.tsx`) plus `traffic_summary()`, the one function the daily email reads. Insert open to anon; SELECT admin-only; EXECUTE on the function revoked from anon and authenticated and granted to service_role. New table and function only — touches nothing existing |
| `20260917140000_traffic_summary_exclusions.sql` | Applied 2026-09-17 | Replaces `traffic_summary()` with a version taking an `excluded_email_patterns text[]`, so demo and internal accounts stay out of the daily email. The list itself is in `lib/internalAccounts.tsx`, not in SQL — adding a colleague is a code change, not a migration. Drops the old zero-argument function rather than overloading it |
| `20260917150000_traffic_summary_require_patterns.sql` | Applied 2026-09-17 | Removes the `default` from `traffic_summary(text[])`. The default meant a caller that omitted the list — a stale deployment — silently got completely unfiltered numbers and a success response, which is exactly what happened on production. A no-argument call now fails to resolve. See "The exclusion that was not applied" |
| `20260918120000_profile_contact_location_experience.sql` | Applied 2026-09-18 | Adds `profiles.contact_number` (backfilled from `raw_user_meta_data`; 4 rows on production), converts `profiles.years_experience` from `integer` to a text band, backfills `profiles.location` from metadata, and rewrites `handle_new_user()` to carry all three onto the row. **Section 2 is one-way** — the original integers are not recoverable from the bands. Tested on staging by creating a real auth user through the admin API and reading the row back, including the blank-metadata case; both test users deleted. See "Signup detail columns" |
| `20260921120000_cslb_license_verification.sql` | Applied to staging 2026-09-21. **Not on production** | CSLB C-10 licence verification: `cslb_licenses`, its staging table and the `cslb_imports` ledger, the decision table in `cslb_evaluate_license()`, and an AFTER trigger on `role_credentials` that re-checks a licence whenever it is written. Adds `user_badge_reviews.reason` and a `needs_review` decision. **Inert until `20260921130000`** — every write path early-outs while the `license_verified` badge is inactive, which also stops it breaking C-10 signups on a database with no imported data |
| `20260921130000_activate_license_verified.sql` | Applied to staging 2026-09-21. **Not on production** | Switches `license_verified` active and sweeps every existing C-10 against the import. **Push only after the import has been loaded into that project** — it warns and skips the sweep rather than running it against data that is missing or stale. Does not touch `business_verified` or the `employer_verified` re-sync from section 7b of `20260916130000` |
| `20260921140000_cslb_ownership_checks.sql` | Applied to staging 2026-09-21. **Not on production** | Two ownership checks added to `cslb_evaluate_license()`: `already_claimed` (the number is verified on another account) and `name_mismatch` (the account's business name does not resemble the CSLB record). CSLB publishes every licence number publicly, so the original seven checks proved a number was real and nothing about who typed it. Adds a **unique partial index** making one-licence-one-verified-badge a database invariant, demoting any duplicate already present before creating it. Changes the signatures of `cslb_evaluate_license` and `cslb_apply_check`, so both are dropped and recreated |
| `20260921150000_licence_notifications.sql` | Applied to staging 2026-09-21. **Not on production** | Tells people what happened. Adds `user_badges.check_reason` (the reason, denormalised so the badge OWNER can read it — `user_badge_reviews` is admin-only because it carries private notes and the other party in a claim dispute), the `email_outbox` queue, a notification and a queued security email to the licence holder when a claim is blocked, and a trigger notifying the contractor on verified / rejected / revoked. Backfills `check_reason` for badges `20260921140000` already queued |
| `20260921160000_claim_alert_dedupe_fix.sql` | Applied to staging 2026-09-21. **Not on production** | Fixes the held-back-claim alert never firing. `20260921150000` deduped on whether an `already_claimed` **review row** existed in the last 7 days, but a review row and an alert are different events — every row written before alerting shipped suppressed the first real alert. Dedupe now reads the `license_claim_attempt` **notification** instead, moved into `cslb_raise_claim_alert()` so the backfill shares one copy. Backfills the alerts already swallowed, indexes `notifications (user_id, type, created_at)`, and rewrites both review-badge descriptions so they read correctly in every status |
| `20260922120000_cslb_all_classifications.sql` | Applied to staging 2026-09-22. **Not on production** | The import stops filtering to C-10, so a licence in another classification can be answered `wrong_classification` instead of `not_found`. Found by licence 1117700 — a real, current, CLEAR **C-36** licence whose holder was told we could not find their number. `wrong_classification` had existed since `20260921120000` and could never fire. Three parts: the decision table checks classification **before** status and expiry (a no-op for every row in the table today, since all of them hold C10 — and what lets non-C-10 rows be stored **slim**: number, classifications and `class_keys`, no names or cities for 215,396 contractors who will never hold an account); `cslb_imports.c10_count` plus a second guard in `cslb_commit_import()` on the C-10 count alone; and refreshed table comments. **No table DDL beyond the new ledger column** — `class_keys` was stored rather than assumed from the start, exactly so the filter could widen without touching a function. `cslb_commit_import` is dropped and recreated because its returns table grows, so its grants are restated |
| `20260922130000_cslb_surface_classification.sql` | Applied to staging 2026-09-22. **Not on production** | Says WHICH classification. `20260922120000` made `wrong_classification` reachable but it stopped at "not a C-10", so the reviewer's next move was to look up a number we had already looked up. `cslb_evaluate_license()` now returns `checked_classifications text[]` (dropped and recreated — the returns table grows), `cslb_apply_check()` writes it onto the audit row, `user_badge_reviews.checked_classifications` stores it, and the admin card renders it labelled from `CSLB_CLASSIFICATIONS` in `lib/cslb.tsx`. **The decision table is untouched** — same ten rules, same order, one more output column. Populated on every path that read a record, not only `wrong_classification`; NULL for `no_number`, `stale_data` and `not_found`, which read none |
| `20260922140000_backfill_review_classifications.sql` | Applied to staging 2026-09-22. **Not on production** | Fills `checked_classifications` on audit rows written before the column existed. **A re-sweep cannot do this** — `cslb_apply_check()` returns `unchanged` and writes nothing when status, expiry and reason all match, which is the guard that stops a standing conflict re-alerting weekly, so a column added after a check ran is never filled by running the check again. Backfills only rows whose reason actually read a record (not `no_number`/`stale_data`/`not_found`) and whose `source_as_of` matches the current import, so no audit row is given evidence from a file it never consulted. Idempotent. Two rows on staging; none on production if `20260922130000` lands before its first import, which is the intended order |
| `20260922150000_badge_marker_and_tab_links.sql` | Applied to staging 2026-09-22. **Not on production** | Two UI-serving changes. `public_badges` gains `icon` and `label` (appended, so the five existing columns keep their positions), letting the single marker beside a name be drawn as the badge's own glyph and titled with what it verified — from the one batched query `useProfileBadges` already sends, rather than a second round trip. And the licence notifications deep-link into the now-tabbed profile editor: `license_verified` to `?tab=badges`, `license_rejected` / `license_revoked` / `license_claim_attempt` to `?tab=credentials`. `cslb_raise_claim_alert()` and `notify_license_decision()` are replaced whole with **only the link changed** — verified by diffing both against their originals. **Existing `notifications.link` rows are not rewritten**: a link records where a message pointed when it was sent, and an old one still lands on a working page |

**Verified 2026-09-16, both projects.** Four rows above said **Not applied**
when the migrations had in fact been pushed — `20260910130000`,
`20260915120000`, `20260916120000` and `20260916140000` — so this table had
drifted far enough to be misleading. The `20260916140000` row was the worst of
it: it warned to push before deploying or the Badges section would 400, which
read as an open deploy blocker and was not one.

This table is hand-maintained and the database will not update it for you.
Confirm against the ledger rather than trusting it:

```
npm run db:linked                      # which project am I pointed at
npm run db:status                      # local vs remote, per migration
npm run db:link:prod && npm run db:status && npm run db:link:staging
```

`db:status` is read-only, so the production check above is safe — but it does
leave production linked in `supabase/.temp/` until the last command runs, which
is the whole reason step 8 of the loop in `CLAUDE.md` is not optional.

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
6. **The CSLB licence table.** `cslb_licenses` is 29,000 rows of imported
   reference data. The migration creates the table; nothing fills it. Each
   project needs its own `scripts/import-cslb.mjs` run — see below.

## Importing the CSLB file

Licence verification checks a C-10's number against an imported copy of the
CSLB Master List. **That import is data and does not travel with a migration.**
A project that has had `db push` run against it has the table, the trigger and
the decision function, and verifies nobody, because the table is empty.

**Per project, in this order:**

```
1. npm run db:linked                       # confirm the target
2. npm run db:push                         # 20260921120000 -- inert on its own
3. download the Master List from CSLB      # note the file date beside the link
4. save to scripts/data/cslb-license-master.csv
5. node --env-file=.env.local scripts/import-cslb.mjs --as-of <file date>
6. npm run db:push                         # 20260921130000 -- switches it on
```

**Push the whole CSLB set — through `20260922130000` — before step 5, not
after.** `20260922120000` is what makes
`cslb_commit_import()` accept the C-10 count the script now sends, and what
moves the classification check ahead of the status checks so the slim rows the
script now writes are never read for a status they do not have.
`20260922130000` is what records the classification onto the audit row the
sweep writes at the end of the import — get it in first and there is nothing to
backfill afterwards, because `cslb_apply_check()`'s `unchanged` early return
means a later sweep will not fill it in (see `20260922140000`).

Pushing the whole pending set in one `db push` does this in the right order on
its own; the only way to get it wrong is to import against a project stopped
part-way.

### What the import contains

Every classification, 244,519 rows. The 29,123 holding C-10 carry the full
column set; the other 215,396 carry their number, their classifications and
nothing else — no names, no cities, no statuses. That is enough to answer
`wrong_classification` and it is all those records are ever asked.

The dry run is the way to see it before anything is written, and needs no
credentials:

```
node scripts/import-cslb.mjs --dry-run
```

### Re-importing a project that was imported before `20260922120000`

Nothing special to do, and **no `--force`**. Both guards compare against the
previous import and both are satisfied by a widening: the total goes up, and the
C-10 count comes out the same 29,123. The old ledger row has no `c10_count` —
it predates the column — and `cslb_commit_import()` reads `coalesce(c10_count,
row_count)` for exactly that row, which is correct, because before the widening
every imported row was a C-10.

The sweep at the end of the script re-checks every C-10 contractor. Existing
outcomes do not move: the C-10 rows are byte-for-byte what they were. The only
badges that change are the ones this migration is for — a contractor holding a
licence in another classification, who was `not_found` and becomes
`wrong_classification`.

**Read the C-10 line.** It is the format canary: with every row now kept, a
classification column CSLB has respelled leaves the total looking perfectly
healthy while `class_keys` comes back empty for all 244,519 — and the next
sweep would report every verified electrical contractor as
`wrong_classification` and email them about it. The script refuses outright at
zero, and `cslb_commit_import()` refuses a C-10 count below 90% of the previous
import's `c10_count` even when the total holds up.

Then repeat the whole thing for the other project. Step 5 writes to whatever
`.env.local` points at, **not** to whatever is linked — those are the two
independent switches described in `CLAUDE.md`, and this is one more thing that
reads the second one. The script prints the project ref before it does
anything, and refuses the production ref without an explicit `--prod`.

`--as-of` is the date CSLB generated the file, printed beside the download.
It is not optional and not guessed from the file's timestamp: it becomes
`source_as_of`, and the 30-day staleness guard measures it. A wrong date makes
stale data look fresh, which is the one failure the guard exists to prevent.

**Expect the first sweep after `20260921140000` to move badges.** Every
already-verified C-10 whose business name does not resemble its CSLB record
goes back to review — that is the new check working on accounts verified before
it existed, not a fault. Measured against the 2026-09-19 file, 99.94% of C-10
licences match their own registered name; the 16 that cannot (names made
entirely of stop words, like "THE ELECTRIC COMPANY") need one manual approval
each, for good.

**Re-run it weekly.** Past 30 days the check stops verifying new signups and
sends them to the Badge Requests tab instead, which shows the warning. Existing
badges are unaffected — each expires on its own licence date.

### The email queue

A blocked licence claim queues a security alert to the account that holds the
licence, in `email_outbox`, in the same transaction as the block. Postgres
cannot call Resend and the paths that detect a claim have no server route, so
something else sends it:

- The signup page and the profile editor call `/api/email/drain`
  fire-and-forget as soon as they write a credential, so in the ordinary case
  the alert goes out in seconds.
- **`/api/email/drain` also runs daily from `vercel.json`** (09:00) as the
  backstop. Daily is a Vercel Hobby limit, not a choice — one invocation per
  cron per day. It catches the case the nudge cannot: a claim made by someone
  crafting raw requests rather than using our pages. The block itself is
  immediate either way; only the telling waits.

It needs `RESEND_API_KEY` and `CRON_SECRET` set in the environment — the same
two the daily summary uses. **Without `RESEND_API_KEY` the alerts queue and
never send**, which is visible as rows in `email_outbox` with `sent_at` null.
A row that keeps failing carries its `last_error`; after five attempts it stops
being retried and stays for someone to look at.

`--dry-run` parses the file and reports without touching a database or needing
credentials. Worth running on a fresh download: a CSLB format change shows up
as a missing column or a collapsed C-10 count, with nothing at stake.

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

---

## Credential verification guards

`20260917120000_role_credentials_verification_guards.sql`, applied to both
projects 2026-09-17, alongside the profile-page editor for signup credentials.

Two holes, same invariant — a `verified` flag must only ever mean "an
administrator checked *these* values":

1. **Editing a verified credential kept the flag.** `20260909120000` revoked
   UPDATE and granted back only `fields`, which stops a user setting `verified`
   directly and misses the obvious route: get verified honestly, then change the
   licence number. A `BEFORE UPDATE` trigger now clears `verified` and
   `verified_at` whenever `fields` changes, for every caller including
   service_role.

2. **INSERT was never restricted the way UPDATE was.** The policy checks only
   `profile_id = auth.uid()`, so a user holding a role with no credentials row
   could insert one with `verified = true`. A `BEFORE INSERT` trigger now raises
   `42501` for a non-admin, non-service_role caller, matching
   `profiles_guard_signup_type()`.

**Why triggers and not a server route.** `grant update (fields)` means the
browser can always write that column directly. A route would only bind callers
that choose to use it, which makes the reset a convention; it has to be an
invariant. The database also covers writers that do not exist yet.

### What the test run found

Verified against staging with a throwaway user before the production push. All
ten checks passed, including that an update writing *identical* field values
does **not** clear verification (`is distinct from`, so it is NULL-safe and a
no-op stays a no-op).

It also caught a real bug in the app code: **`upsert` is refused on this table
for `authenticated`.** PostgREST compiles an upsert to `ON CONFLICT DO UPDATE
SET` over every column in the payload, including `profile_id` and `role_key`,
and only `fields` carries an UPDATE grant. The result is a flat
`permission denied for table role_credentials` that names no column. Plain
INSERT and a fields-only UPDATE are both fine, so the profile editor does
UPDATE-then-INSERT. The onboarding route may keep its upsert: it holds
service_role and is not subject to any of this.

---

## The exclusion that was not applied

`20260917140000` added an `excluded_email_patterns text[]` parameter to
`traffic_summary()` so demo and internal accounts stay out of the daily email.
It gave that parameter `default array[]::text[]`. `20260917150000` takes the
default away, after the first version of this shipped and did nothing.

**Symptom.** Production kept reporting the unfiltered signup count after a
deploy that was supposed to fix it. The filter looked correct, and it was.

**Cause.** The default made two different situations identical:

| Call | Meant | Did |
|---|---|---|
| `traffic_summary(ARRAY[...])` | exclude these | excluded them |
| `traffic_summary()` | *caller forgot the list* | **excluded nothing, returned 200** |

Any caller that did not pass the list — a deployment predating the commit that
passes it, a hand-run query, a JSON body where the key serialised to `undefined`
and was dropped — resolved the default and got completely unfiltered numbers
back, with no error anywhere. The numbers were plausible, which is what made it
survive a review.

**Fix.** No default. A no-argument call now fails outright with
`Could not find the function public.traffic_summary without parameters in the
schema cache`, the route returns 500, and it is in the log the same morning. An
explicitly empty array still means "exclude nothing", which keeps a deliberate
unfiltered read available.

**The trade, stated plainly:** until a deployment that passes the list is live,
the email errors instead of arriving. A summary that does not turn up gets
chased. One that turns up with inflated numbers gets believed.

**The general rule.** A default argument on an aggregate that feeds a report is
a way to be wrong quietly. If the difference between "not supplied" and "supplied
as empty" changes the answer, do not let one of them be the fallback.

---

## Signup detail columns

`20260918120000_profile_contact_location_experience.sql`, applied to staging and
then production on 2026-09-18. Three problems, one migration.

**`contact_number` had no column.** Signup has asked for a phone number since
launch and written it into `auth.users.raw_user_meta_data`, which no query
reaches — not an admin screen, not the directory, not an export. Every number
collected was write-only. The column is new, nullable text, backfilled from
metadata: 4 rows on production, and the profile page now reads and writes the
column rather than metadata.

**`years_experience` was the wrong type.** An `integer`, rendered as
"{n} years experience" on four surfaces, presenting a precision nobody has.
It is now text holding a band (`'3-5 years'`). The conversion is **one way** —
production held 3, 9, 10, 12, 15, 22 and five NULLs, all of which mapped
cleanly, and those original numbers are now gone. Boundaries are `<=2`, `<=5`,
`<=10`, else; a stored 10 lands in `'6-10 years'` because the lower band cannot
overstate.

No CHECK constraint on the band, deliberately, and the same call as `trade` and
`location`: the list is `EXPERIENCE_BANDS` in `lib/signupRoles.tsx` and editing
it should not need a migration. The cost is that any string can be written
there. It is self-declared and gates nothing.

**`location` was never written by the trigger.** The column existed;
`handle_new_user()` did not touch it. The app had been filling it in from the
browser right after `signUp`, which cannot work on production — email
confirmation is on there, `signUp` returns no session, and there is no
authenticated connection to write with until the link is clicked. An interim
version papered over that with a reconciliation on first dashboard load; that
was a second writer for one fact, running at a different time, and both are
gone. Section 4 teaches the trigger to read `location`, `contact_number` and
`years_experience`, so there is one writer at row creation.

Google accounts still do not come through the trigger with any of this — it
fires at the OAuth callback with Google's metadata, which carries none of these
keys. `app/api/onboarding/complete/route.tsx` writes them afterwards with
service_role, and re-checks every required field rather than trusting the form.

### How it was tested

Staging, before the production push, by creating real auth users through the
admin API rather than inserting into `auth.users` by hand — the trigger fires on
the same path a signup takes:

| Case | Result |
|---|---|
| Full metadata, contact number padded with spaces | Row carried `location`, trimmed `contact_number`, and the band in `years_experience`. `role_credentials` held only the credential keys — no band copy |
| All three keys empty or whitespace | All three stored as `NULL`, not `''`, so `is null` keeps meaning "not answered" |

Both test users were deleted afterwards; `profiles` has no rows left matching
`%@sparxplug-test.invalid`.

**What is NOT covered by this migration**, and is dashboard state as usual:
nothing. It is schema only. But note the ordering constraint it creates — the
app reads `profiles.contact_number` and treats `years_experience` as text, so
this had to land **before** the code deploys. It did, on both projects.
