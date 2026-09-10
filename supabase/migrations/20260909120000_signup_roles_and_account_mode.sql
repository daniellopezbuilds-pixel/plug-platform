-- =============================================================================
-- Signup schema: roles, credentials, and the account_type / active_mode collapse
--
-- Source: supabase/archive/pending.sql.
-- Spec:   docs/signup-and-brand-spec.md, sections 1, 2 and 4.1.
--
-- STATUS: NOT APPLIED. This is the only one of the three folded-in files that
-- actually changes the live database. Review, then `npm run db:push`.
--
-- ORDERING
--   Migrations apply in filename order. The baseline sorts first
--   (20260908000000), then the branding-deals record (20260909110000), then
--   this file.
--
-- UNBLOCKED 2026-09-10
--   Section 6 was a stub while the signup trigger body was unreadable. The
--   baseline captured it, so section 6 is now written against the real
--   function rather than against a guess. Section 4's backfill was also
--   corrected once the baseline revealed profiles.account_type DEFAULT 'both'
--   -- see the note in section 4a.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. roles -- reference table
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
-- 2. account_roles -- many-to-many, hangs off profiles.id
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
-- 3. role_credentials -- one row per role a profile holds
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
  'Optional at signup -- verify later, gate the feature not the registration.';

comment on column public.role_credentials.verified is
  'False for anything sourced from raw_user_meta_data, which is client-writable '
  'and therefore user-claimed, never proven. Only an admin review may set this '
  'true. See the backfill rule in section 6.';

-- Deliberately namespaced, and `create` rather than `create or replace`.
-- A bare public.set_updated_at() is a very common name; if the baseline
-- already defined one for other tables, `or replace` would silently swap its
-- body out from under those triggers. This name cannot collide, and if it
-- somehow does the migration fails loudly instead of clobbering.
--
-- Checked against the baseline 2026-09-10: neither public.set_updated_at nor
-- public.role_credentials_touch_updated_at exists. Safe to create.
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
--   role         text  default 'worker'  -- written by the signup trigger
--   account_type text  default 'both'    -- never written by anything
--   active_role  text  default 'worker'  -- drives sidebar + dashboard
--
-- All three are nullable text. There are no enum types to alter, and the
-- baseline confirms there is no CHECK constraint on any of them, so this is a
-- re-value plus one added column.
--
-- After this migration:
--   account_type text  -- 'company' | 'individual' | 'brand'   what the account IS
--   active_mode  text  -- 'worker'  | 'employer'   | 'brand'   which dashboard shows
--   role, active_role  -- DEPRECATED, retained until the app cutover (section 5)
--
-- NOTE THE TWO VOCABULARIES. They are deliberately different, because they
-- answer different questions. account_type is what the account signed up as;
-- active_mode is which dashboard it is looking at right now. Every non-brand
-- account can switch between worker and employer whatever its type, so the two
-- do not line up and must not be collapsed into one column. See spec section 2
-- and the header of lib/accountModes.tsx.
--
-- An earlier draft of this file gave active_mode the account_type vocabulary
-- and set one from the other. That would have pinned each account to a single
-- dashboard and put a CHECK constraint in the way of the switcher.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists active_mode text;

-- Surface anything the mapping below would silently swallow, rather than
-- quietly filing unknown values under 'individual'.
--
-- 'both' is excluded from the source expression rather than listed as expected:
-- it is the column default and carries no information, so nullif() drops it
-- here exactly as it does in 4a. If it were merely added to the allow-list this
-- check would pass on every row while 4a mapped every row wrong.
do $$
declare
  unexpected text;
begin
  select string_agg(distinct quote_literal(v), ', ')
    into unexpected
  from (
    select coalesce(nullif(account_type, 'both'), role) as v from public.profiles
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

-- 4a. account_type.
--
-- THE 'both' PROBLEM. profiles.account_type is declared
-- `text DEFAULT 'both'::text`, and handle_new_user() never writes the column --
-- it inserts only (id, email, full_name, role, xp). So every row created by
-- signup carries the literal string 'both', and no code path has ever
-- overwritten it.
--
-- The earlier version of this backfill read coalesce(account_type, role,
-- 'worker'). Because 'both' is not null, that coalesce returned 'both' for
-- every row, fell through to the else branch, and would have filed the entire
-- user table under 'individual' -- every employer included -- while looking
-- like it had consulted `role`.
--
-- nullif(account_type, 'both') is the fix: treat the default as the absence of
-- an answer and fall through to `role`, which the trigger does populate and
-- which is the column the rest of the schema actually keys off (see section 5).
--
-- There is a live display bug next door to this, and this migration does NOT
-- fix it. app/dashboard/profile/[id]/page.tsx and ProfilePreviewModal.tsx both
-- compute `profile.account_type || profile.role` and compare it to "employer".
-- With account_type = 'both' the || short-circuits on a truthy value, `role` is
-- never reached, and isEmployer is false for everyone -- the employer badge and
-- company description render for nobody today. After this backfill the value is
-- 'company', which is still not "employer", so it stays broken. It is fixed by
-- the app cutover in spec section 2, when those two files start comparing
-- against 'company'. Flagged here so nobody reads the backfill as the fix.
update public.profiles
set account_type = case coalesce(nullif(account_type, 'both'), role, 'worker')
      when 'employer'   then 'company'
      when 'worker'     then 'individual'
      when 'company'    then 'company'
      when 'individual' then 'individual'
      when 'brand'      then 'brand'
      else 'individual'
    end;

-- 4b. active_mode. Carried over from active_role, NOT derived from
--     account_type.
--
--     active_mode is the direct successor to active_role: same question, same
--     vocabulary, new name. Copying the value across means nobody moves
--     dashboards when this runs and nobody moves when the app later cuts over
--     to reading the new column. The switcher keeps working throughout,
--     because every non-brand account still has both modes available to it.
--
--     Brand accounts are the exception and are pinned to 'brand', since worker
--     and employer are meaningless for an account that does no electrical
--     work. No such rows exist yet -- brand signup is blocked at submit -- but
--     the branch is here so the column is right the day one does.
--
--     The CASE is total: it always produces one of the three allowed values,
--     so the CHECK below cannot fail on a stray active_role.
update public.profiles
set active_mode = case
      when account_type = 'brand'                       then 'brand'
      when coalesce(active_role, role) = 'employer'     then 'employer'
      else                                                   'worker'
    end;

-- 4c. NOT NEEDED. Kept as a record of a rejected option.
--
--     An earlier draft offered to rewrite active_role to match account_type,
--     so that a user whose mode disagreed with their type was not stranded in
--     a dashboard they could no longer leave. That stranding was a symptom of
--     restricting each account to one mode. Both modes stay available to every
--     non-brand account, so nothing strands and there is nothing to align.
--
--     It stays commented for a second reason: the rows it would have "fixed"
--     are not broken. An employer deliberately sitting in worker mode is a
--     contractor looking for work, which is exactly the behaviour being kept.
--     Rewriting active_role would silently undo a choice the user made.
--
-- update public.profiles
-- set active_role = case account_type when 'company' then 'employer'
--                                     else 'worker' end;

-- The old 'both' default must go in the same migration as the CHECK below.
-- Left in place it would put every new row in violation immediately.
--
-- The two defaults differ because the two columns hold different vocabularies:
-- a new account is an individual, and it lands in worker mode.
alter table public.profiles
  alter column account_type set default 'individual',
  alter column active_mode  set default 'worker';

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
    check (active_mode in ('worker', 'employer', 'brand'));


-- -----------------------------------------------------------------------------
-- 5. Deprecate role and active_role -- do NOT drop yet
--
-- Application readers:
--   app/dashboard/messages/page.tsx  selects profiles.role
--   hooks/useActiveRole.tsx          reads and writes active_role
--
-- DATABASE reader, found in the baseline and not previously listed here:
--
--   public.is_messaging_blocked(uuid) reads profiles.role twice --
--     `if my_role is distinct from 'worker' ...`
--     `select (p.role = 'employer') into other_is_employer`
--
--   and that function is called from the RLS policy "Participants can send
--   messages" on public.messages:
--
--     with check (sender_id = auth.uid()
--                 and is_conversation_participant(conversation_id)
--                 and not is_messaging_blocked(conversation_id))
--
-- So `role` is load-bearing inside an RLS policy, not just in a page query.
-- Dropping the column breaks message sending at the database level, and the
-- failure surfaces as a policy violation on INSERT rather than as a missing
-- column in a select. is_messaging_blocked has to be rewritten against
-- account_type in the same migration that drops role.
--
-- Note also that hooks/useConversations.tsx and useConversationParticipants.tsx
-- type a joined participant `role`. Confirm whether that resolves to
-- profiles.role or a conversation_participants column before dropping.
-- -----------------------------------------------------------------------------

comment on column public.profiles.role is
  'DEPRECATED. Superseded by account_type. Still read by '
  'app/dashboard/messages/page.tsx AND by public.is_messaging_blocked(), which '
  'the "Participants can send messages" RLS policy depends on. Rewrite that '
  'function before dropping this column.';

comment on column public.profiles.active_role is
  'DEPRECATED. Superseded by active_mode. Retained until hooks/useActiveRole.tsx '
  'is cut over; drop in a follow-up migration.';

-- Follow-up migration, once the app no longer reads either column:
--   create or replace function public.is_messaging_blocked(uuid) ... -- vs account_type
--   alter table public.profiles drop column role;
--   alter table public.profiles drop column active_role;


-- -----------------------------------------------------------------------------
-- 6. The signup trigger
--
-- The baseline captured the real body. For reference, this is what is being
-- replaced:
--
--   insert into public.profiles (id, email, full_name, role, xp)
--   values (new.id, new.email, new.raw_user_meta_data->>'full_name',
--           coalesce(new.raw_user_meta_data->>'role', 'worker'), 0)
--   on conflict (id) do nothing;
--
-- It writes `role` and nothing else of the identity columns, which is why
-- account_type sat at its 'both' default forever (section 4a).
--
-- WHAT CHANGES
--
--   * writes account_type and active_mode, validated against the three
--     allowed values
--   * KEEPS writing role and active_role. The stub sketch said "stop writing
--     role" -- that is wrong while section 5 holds: is_messaging_blocked()
--     reads profiles.role from inside an RLS policy, so a new signup with a
--     null role would be unable to send messages. Both legacy columns are
--     dropped together in the follow-up migration.
--   * populates account_roles and role_credentials from signup metadata
--
-- SECURITY DEFINER is preserved -- it must be. The function runs as
-- supabase_auth_admin during signup, before the new user has a session, so it
-- could never satisfy the "users insert their own profile" policy that
-- fix-admin-escalation.sql installed. (That file flagged this as reasoned but
-- unverified; the baseline confirms the original was SECURITY DEFINER.)
--
-- search_path is tightened from 'public' to '' and every name below is
-- schema-qualified, matching profiles_guard_admin_escalation(). A definer
-- function with a mutable search_path is the standard privilege-escalation
-- shape.
--
--
-- WHAT THE SIGNUP FORM ALREADY WRITES
--
-- app/signup/page.tsx sends these through supabase.auth.signUp options.data:
--
--   full_name
--   role              legacyRoleFor(type)   'worker' | 'employer'
--   signup_type       'c10' | 'electrician' | 'instructor'
--                     (brand is a fourth choice in the UI but is blocked at
--                     submit, so it never reaches the database)
--   account_type      accountTypeFor(type)  'company' | 'individual' | 'brand'
--   roles             roleKeysFor(type), always exactly one element
--   signup_fields     { <field>: <value> } for the chosen type, blanks stripped
--
-- signup_type is authoritative; account_type and roles are derived from it in
-- lib/signupRoles.tsx. This function reads account_type and roles directly
-- rather than re-deriving from signup_type, and validates both -- see below.
--
-- NOTE the vocabulary gap: signup_type 'c10' maps to roles.key 'contractor'.
--
-- signup_fields is flat, not keyed by role, because only one type's fields are
-- ever collected. It is stored under the single role_key from `roles`.
--
--
-- BACKFILL RULE -- raw_user_meta_data IS NOT TRUSTED INPUT
--
-- raw_user_meta_data is written by the client. Any signed-up user can put
-- arbitrary JSON there, including role keys they do not hold and licence
-- numbers that are not theirs. It is a user's claim about themselves, not a
-- verified fact, and it stays that way no matter how long it sits in the table.
--
-- So this function:
--
--   * sets role_credentials.verified = false with no exception and no "it
--     looked complete" heuristic, and leaves verified_at null to match (the
--     check constraint enforces the pair).
--   * joins claimed role keys against public.roles and discards anything that
--     does not match, rather than inserting them and hitting the FK.
--   * validates account_type against the three allowed values and falls back
--     to the legacy `role` key, then to 'individual'. Never trusts it blind.
--   * type-checks the jsonb before iterating it. A malformed `roles` value --
--     a string where an array is expected -- would otherwise raise inside the
--     trigger and fail the entire signup, turning a bad metadata payload into
--     an outage.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb  := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  acct_type   text;
  legacy_role text;
  start_mode  text;
  role_keys   text[];
  claimed     jsonb;
begin
  -- account_type, validated. Anything not in the allowed set is a claim we do
  -- not honour, so fall back to the legacy role key and finally to individual.
  acct_type := case meta ->> 'account_type'
    when 'company'    then 'company'
    when 'individual' then 'individual'
    when 'brand'      then 'brand'
    else case meta ->> 'role'
      when 'employer' then 'company'
      when 'worker'   then 'individual'
      else 'individual'
    end
  end;

  -- Legacy vocabulary, still required by is_messaging_blocked() and the
  -- messages page. Mirrors legacyRoleFor() in lib/signupRoles.tsx: a brand is
  -- written as 'employer' so it is never treated as a blockable worker, which
  -- is a messaging concern and not a claim that a brand employs anyone.
  legacy_role := case acct_type when 'individual' then 'worker' else 'employer' end;

  -- Which dashboard the account LANDS IN. account_type decides the starting
  -- mode and nothing more -- a non-brand account can switch to the other mode
  -- immediately and for ever after. active_mode therefore carries the mode
  -- vocabulary, not the account_type one. See spec section 2.
  start_mode := case acct_type when 'brand' then 'brand' else legacy_role end;

  insert into public.profiles (
    id, email, full_name, xp,
    account_type, active_mode,
    role, active_role
  )
  values (
    new.id,
    new.email,
    meta ->> 'full_name',
    0,
    acct_type,
    start_mode,
    legacy_role,
    legacy_role
  )
  on conflict (id) do nothing;

  -- Role keys: validated by joining against the seeded reference table, which
  -- discards unknown keys before they can violate the account_roles FK.
  -- distinct guards against a duplicated key in the claimed array.
  if jsonb_typeof(meta -> 'roles') = 'array' then
    select array_agg(distinct r.key)
      into role_keys
    from jsonb_array_elements_text(meta -> 'roles') as m(key)
    join public.roles r on r.key = m.key;
  end if;

  if coalesce(array_length(role_keys, 1), 0) > 0 then
    insert into public.account_roles (profile_id, role_key)
    select new.id, k
    from unnest(role_keys) as k
    on conflict (profile_id, role_key) do nothing;

    claimed := meta -> 'signup_fields';

    -- Only store a credential row when something was actually entered. An
    -- empty {} row asserts nothing and just makes the table harder to read.
    if jsonb_typeof(claimed) = 'object' and claimed <> '{}'::jsonb then
      insert into public.role_credentials (
        profile_id, role_key, fields, verified, verified_at
      )
      select new.id, k, claimed, false, null
      from unnest(role_keys) as k
      on conflict (profile_id, role_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profiles row on signup and populates account_roles and '
  'role_credentials from raw_user_meta_data. Metadata is client-written and '
  'therefore user-claimed: role keys are validated against public.roles and '
  'credentials are always stored verified = false. Still writes the deprecated '
  'role / active_role columns because is_messaging_blocked() depends on role. '
  'See docs/signup-and-brand-spec.md s1.';

-- The trigger itself is unchanged and is already in the baseline:
--   create trigger on_auth_user_created after insert on auth.users
--     for each row execute function public.handle_new_user();
-- Replacing the function body is enough.


-- -----------------------------------------------------------------------------
-- 7. RLS for the new tables
--
-- These three tables are new, so these policies are safe to define here -- they
-- are not a guess at what the dashboard-managed policies on existing tables do.
--
-- Admin writes go through lib/supabaseAdmin.tsx (service_role), which bypasses
-- RLS entirely, so no admin write policies are needed.
--
-- ON is_platform_admin(): the earlier draft defined one here, with a note to
-- drop it if the baseline turned out to have an equivalent. It does --
-- public.is_admin(), SECURITY DEFINER over profiles, already referenced by
-- roughly a dozen baseline policies. Two helpers answering the same question is
-- exactly the drift this migration exists to stop, so the policies below call
-- the existing one and is_platform_admin() is not created.
-- -----------------------------------------------------------------------------

alter table public.roles             enable row level security;
alter table public.account_roles     enable row level security;
alter table public.role_credentials  enable row level security;

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
-- Owner and admins only -- never world-readable like account_roles.
drop policy if exists "users read their own credentials" on public.role_credentials;
create policy "users read their own credentials"
  on public.role_credentials for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

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
--
-- This is the pattern fix-admin-escalation.sql argued against for profiles, and
-- the reasoning is not contradictory: profiles has ~25 writable columns and is
-- actively growing, so enumerating them is a maintenance trap. This table has
-- one writable column by design.
revoke all    on public.role_credentials from anon;
revoke update on public.role_credentials from authenticated;
grant  update (fields) on public.role_credentials to authenticated;
