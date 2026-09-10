-- ############################################################################
-- ARCHIVED 2026-09-10. Do not run. Superseded by
-- supabase/migrations/20260909120000_signup_roles_and_account_mode.sql.
--
-- This file was never applied. It moved into migrations/ once the baseline
-- landed and unblocked its two open items. Two things changed on the way, both
-- because the baseline made them visible:
--
--  1. Section 4a mapped every row wrong. profiles.account_type is declared
--     DEFAULT 'both' and handle_new_user() never wrote the column, so
--     coalesce(account_type, role, 'worker') returned 'both' for
--     every row and filed the whole table under 'individual'. The
--     migration uses nullif(account_type, 'both') instead.
--
--  2. Section 6 is written, against the real trigger body rather than a sketch.
--     The sketch said "stop writing role"; that would have broken messaging,
--     because is_messaging_blocked() reads profiles.role from inside an RLS
--     policy. The migration keeps writing it.
--
-- Section 7 also drops is_platform_admin() in favour of the baseline's
-- existing public.is_admin(), which is what this file said to do if an
-- equivalent turned up.
-- ############################################################################


-- =============================================================================
-- Signup schema: roles, credentials, and the account_type / active_mode collapse
--
-- Spec: docs/signup-and-brand-spec.md, sections 1, 2 and 4.1
-- Status: NOT APPLIED. Review, then `npm run db:push`.
--
-- ORDERING
--   Migrations apply in filename order. This file assumes the baseline produced
--   by `npm run db:pull` sorts BEFORE 20260909120000. If your pull produced a
--   later timestamp, rename this file to sort after it. See supabase/README.md.
--
-- BLOCKED DEPENDENCY
--   Section 6 below cannot be written until the baseline pull reveals the body
--   of the signup trigger. Read it before pushing.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. roles — reference table
--
-- Seeded, not user-editable. Every role here is data-capture-only in this
-- phase: none of them gates a feature, because the features they would gate
-- (permits, CE) do not exist. See spec section 1.
-- -----------------------------------------------------------------------------

create table if not exists public.roles (
  key         text primary key,
  label       text        not null,
  sort_order  integer     not null default 0,
  active      boolean     not null default true
);

comment on table public.roles is
  'Trade roles offered at signup. Data-capture and ad-targeting only in this '
  'phase; no role gates any feature. See docs/signup-and-brand-spec.md s1.';

insert into public.roles (key, label, sort_order) values
  ('contractor',  'Contractor (C-10)',            1),
  ('electrician', 'Electrician',                  2),
  ('instructor',  'Electrical instructor',        3),
  ('apprentice',  'Apprentice / trainee',         4),
  ('office',      'Office / permit coordinator',  5)
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- 2. account_roles — many-to-many, hangs off profiles.id
--
-- profiles IS the account table (spec s4.1). There is no accounts table.
-- Empty for brand accounts.
-- -----------------------------------------------------------------------------

create table if not exists public.account_roles (
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  role_key    text        not null references public.roles (key)   on update cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, role_key)
);

-- Ad targeting filters profiles BY role. The composite PK only indexes
-- profile_id-first lookups, so the reverse direction needs its own index.
-- This index is the entire reason roles are a join table and not a text[].
create index if not exists account_roles_role_key_idx
  on public.account_roles (role_key);


-- -----------------------------------------------------------------------------
-- 3. role_credentials — one row per role a profile holds
--
-- `fields` is jsonb because each role carries a different set of inputs and
-- those sets will change. Five credential tables would be worse.
--
-- Nothing verifies these in this phase; `verified` stays false. The column
-- exists so the admin review flow has somewhere to write later.
-- -----------------------------------------------------------------------------

create table if not exists public.role_credentials (
  id          uuid        primary key default gen_random_uuid(),
  profile_id  uuid        not null references public.profiles (id) on delete cascade,
  role_key    text        not null references public.roles (key)   on update cascade,
  fields      jsonb       not null default '{}'::jsonb,
  verified    boolean     not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, role_key),
  constraint role_credentials_verified_at_ck
    check (verified = (verified_at is not null))
);

comment on column public.role_credentials.fields is
  'Role-specific credential inputs. Shape varies by role_key; see spec s1. '
  'Optional at signup — verify later, gate the feature not the registration.';

comment on column public.role_credentials.verified is
  'False for anything sourced from raw_user_meta_data, which is client-writable '
  'and therefore user-claimed, never proven. Only an admin review may set this '
  'true. See the backfill rule in section 6.';

-- Deliberately namespaced, and `create` rather than `create or replace`.
-- A bare public.set_updated_at() is a very common name; if the baseline
-- already defines one for other tables, `or replace` would silently swap its
-- body out from under those triggers. This name cannot collide, and if it
-- somehow does the migration fails loudly instead of clobbering.
create function public.role_credentials_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger role_credentials_set_updated_at
  before update on public.role_credentials
  for each row execute function public.role_credentials_touch_updated_at();


-- -----------------------------------------------------------------------------
-- 4. The account_type / active_mode collapse
--
-- Today profiles carries three overlapping text columns:
--   role         text  -- 'worker' | 'employer'   (written by the signup trigger)
--   account_type text  -- 'worker' | 'employer'   (read as coalesce(account_type, role))
--   active_role  text  -- 'worker' | 'employer'   (drives sidebar + dashboard)
--
-- All three are nullable text. There are no enum types to alter, so this is a
-- re-value plus one added column.
--
-- After this migration:
--   account_type text  -- 'company' | 'individual' | 'brand'   what the account IS
--   active_mode  text  -- 'company' | 'individual' | 'brand'   which dashboard shows
--   role, active_role  -- DEPRECATED, retained until the app cutover (section 5)
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists active_mode text;

-- Surface anything the mapping below would silently swallow, rather than
-- quietly filing unknown values under 'individual'.
do $$
declare
  unexpected text;
begin
  select string_agg(distinct quote_literal(v), ', ')
    into unexpected
  from (
    select coalesce(account_type, role) as v from public.profiles
    union all
    select active_role from public.profiles
  ) s(v)
  where v is not null
    and v not in ('worker', 'employer', 'company', 'individual', 'brand');

  if unexpected is not null then
    raise warning
      'profiles: unexpected role/account_type/active_role values, mapped to individual: %',
      unexpected;
  end if;
end $$;

-- 4a. account_type. Source is coalesce(account_type, role) because that is
--     exactly how the app reads it today (profile/[id]/page.tsx, ProfilePreviewModal).
update public.profiles
set account_type = case coalesce(account_type, role, 'worker')
      when 'employer'   then 'company'
      when 'worker'     then 'individual'
      when 'company'    then 'company'
      when 'individual' then 'individual'
      when 'brand'      then 'brand'
      else 'individual'
    end;

-- 4b. active_mode. Set to account_type for every row, NOT carried over from
--     active_role.
--
--     This is a deliberate behaviour change, not a shortcut. Today active_role
--     is independent of account_type: RoleSwitch lets anyone toggle worker /
--     employer and see the other dashboard. Under the new model an account's
--     available modes are constrained by its type (spec s2), and both company
--     and individual have exactly one mode until brand workspaces land. Any
--     user currently sitting in a mode that does not match their type is moved
--     to their type's mode by this statement.
update public.profiles
set active_mode = account_type;

alter table public.profiles
  alter column account_type set default 'individual',
  alter column active_mode  set default 'individual';

alter table public.profiles
  alter column account_type set not null,
  alter column active_mode  set not null;

alter table public.profiles
  drop constraint if exists profiles_account_type_ck,
  add  constraint profiles_account_type_ck
    check (account_type in ('company', 'individual', 'brand'));

alter table public.profiles
  drop constraint if exists profiles_active_mode_ck,
  add  constraint profiles_active_mode_ck
    check (active_mode in ('company', 'individual', 'brand'));


-- -----------------------------------------------------------------------------
-- 5. Deprecate role and active_role — do NOT drop yet
--
-- app/dashboard/messages/page.tsx still selects `role`, and useActiveRole.tsx
-- still reads and writes `active_role`. Dropping either now breaks the running
-- app. They are dropped in a follow-up migration, after the cutover listed in
-- spec section 2.
--
-- Note also that hooks/useConversations.tsx and useConversationParticipants.tsx
-- type a joined participant `role`. Confirm whether that resolves to
-- profiles.role or a conversation_participants column before dropping.
-- -----------------------------------------------------------------------------

comment on column public.profiles.role is
  'DEPRECATED. Superseded by account_type. Retained until app/dashboard/messages '
  'stops reading it; drop in a follow-up migration.';

comment on column public.profiles.active_role is
  'DEPRECATED. Superseded by active_mode. Retained until hooks/useActiveRole.tsx '
  'is cut over; drop in a follow-up migration.';

-- Follow-up migration, once the app no longer reads either column:
--   alter table public.profiles drop column role;
--   alter table public.profiles drop column active_role;


-- -----------------------------------------------------------------------------
-- 6. BLOCKED: the signup trigger
--
-- A trigger on auth.users creates the profiles row from signup metadata and
-- writes `role` out of raw_user_meta_data. It lives only in the Supabase
-- dashboard; its body is not in this repo and was not readable when this
-- migration was written, so it is NOT rewritten here.
--
-- This matters: with section 4 applied and the trigger unchanged, every new
-- signup gets account_type = 'individual' from the column default regardless
-- of what the form submitted, because the trigger only knows how to write
-- `role`. Existing rows are correct; new ones silently are not.
--
-- What the rewritten trigger needs to do:
--   * read account_type from raw_user_meta_data ('company'|'individual'|'brand')
--   * write both account_type and active_mode
--   * stop writing `role`
--   * insert the selected roles into public.account_roles
--
-- To unblock: run `npm run db:pull`, read the captured function body, then
-- write section 6 as a `create or replace function` against it. Do not push
-- this migration to a live project before that is done.
--
--
-- WHAT THE SIGNUP FORM ALREADY WRITES
--
-- app/signup/page.tsx now sends four extra keys through
-- supabase.auth.signUp options.data, so they are already accumulating in
-- auth.users.raw_user_meta_data on every new signup:
--
--   signup_type       'c10' | 'electrician' | 'instructor'
--                     (brand is a fourth choice in the UI but is blocked at
--                     submit, so it never reaches the database)
--   account_type      'company' | 'individual'   derived: c10 -> company
--   roles             text[] of roles.key, always exactly one element
--   signup_fields     { <field>: <value> } for the chosen type, blanks stripped
--
-- The trigger ignores all four. They are there so this migration's backfill
-- has a source to read when it populates account_roles and role_credentials.
--
-- Signup is single-select: one type, therefore one role. account_type and
-- roles are derived from signup_type rather than asked for separately, so
-- signup_type is the authoritative value and the other two must agree with it.
-- If they ever disagree, trust signup_type and re-derive.
--
-- NOTE the vocabulary gap: signup_type 'c10' maps to roles.key 'contractor'.
-- The mapping lives in roleKeyFor() in lib/signupRoles.tsx.
--
-- signup_fields is flat, not keyed by role, because only one type's fields are
-- ever collected. Moving it into role_credentials.fields means storing it
-- under the single role_key from `roles`.
--
--
-- BACKFILL RULE — raw_user_meta_data IS NOT TRUSTED INPUT
--
-- raw_user_meta_data is written by the client. Any signed-up user can put
-- arbitrary JSON there, including role keys they do not hold and licence
-- numbers that are not theirs. It is a user's claim about themselves, not a
-- verified fact, and it stays that way no matter how long it sits in the table.
--
-- So a backfill reading these keys MUST:
--
--   * set role_credentials.verified = false for every row it creates, with no
--     exception and no "it looked complete" heuristic. verified is an assertion
--     that a human checked a licence, and no backfill has done that.
--   * leave verified_at null to match (the check constraint enforces the pair).
--   * discard role keys that are not present in public.roles, rather than
--     inserting them and breaking the account_roles FK.
--   * treat account_type the same way — validate against the three allowed
--     values and fall back to 'individual', never trust it blind.
--
-- The same applies to the rewritten trigger: it may copy metadata into these
-- tables, but it may not mark anything verified.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 7. RLS for the new tables
--
-- These three tables are new, so these policies are safe to define here — they
-- are not a guess at what the dashboard-managed policies on existing tables do.
--
-- Admin writes go through lib/supabaseAdmin.tsx (service_role), which bypasses
-- RLS entirely, so no admin write policies are needed.
-- -----------------------------------------------------------------------------

alter table public.roles             enable row level security;
alter table public.account_roles     enable row level security;
alter table public.role_credentials  enable row level security;

-- Admin check as a security definer so a policy reading profiles cannot
-- recurse into profiles' own RLS.
--
-- Named is_platform_admin, not is_admin, for the same reason as above: a
-- dashboard-created public.is_admin() may already exist and be referenced by
-- baseline policies. `create` (not `or replace`) so a collision aborts the
-- migration rather than redefining a function other policies depend on.
--
-- If the baseline turns out to define an equivalent helper, drop this one and
-- point the policies below at theirs instead of keeping two.
create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- roles: seeded reference data, readable by anyone. No write policy, so only
-- service_role can change it.
drop policy if exists "roles are readable by everyone" on public.roles;
create policy "roles are readable by everyone"
  on public.roles for select
  using (true);

-- account_roles: readable by any signed-in user, because roles show on public
-- profiles (dashboard/profile/[id], ProfilePreviewModal, marketplace) the same
-- way trade and union_status already do. Writable only by the owner.
drop policy if exists "account_roles are readable by authenticated users" on public.account_roles;
create policy "account_roles are readable by authenticated users"
  on public.account_roles for select
  to authenticated
  using (true);

drop policy if exists "users add their own account_roles" on public.account_roles;
create policy "users add their own account_roles"
  on public.account_roles for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists "users remove their own account_roles" on public.account_roles;
create policy "users remove their own account_roles"
  on public.account_roles for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- role_credentials: CSLB numbers, ET card numbers, trainee registrations.
-- Owner and admins only — never world-readable like account_roles.
drop policy if exists "users read their own credentials" on public.role_credentials;
create policy "users read their own credentials"
  on public.role_credentials for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.is_platform_admin());

drop policy if exists "users create their own credentials" on public.role_credentials;
create policy "users create their own credentials"
  on public.role_credentials for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists "users update their own credentials" on public.role_credentials;
create policy "users update their own credentials"
  on public.role_credentials for update
  to authenticated
  using      (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "users delete their own credentials" on public.role_credentials;
create policy "users delete their own credentials"
  on public.role_credentials for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- A user must not be able to mark their own licence verified. RLS gates rows,
-- not columns, so the guard is a column-level grant: revoke UPDATE on the table
-- and hand back only `fields`. verified / verified_at become service_role-only.
revoke all    on public.role_credentials from anon;
revoke update on public.role_credentials from authenticated;
grant  update (fields) on public.role_credentials to authenticated;
