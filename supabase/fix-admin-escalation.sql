-- =============================================================================
-- Fix: privilege escalation via profiles.is_admin
--
-- Status: APPLIED to the live project 2026-09-09, via the Supabase SQL editor.
--         Verification returned both expected rows and exactly one INSERT
--         policy. Not yet represented in supabase/migrations/ -- it cannot be
--         until the baseline pull lands (supabase/README.md step 1), so a
--         future `db reset` would NOT recreate this. Fold it into a migration
--         as soon as the baseline exists.
-- Found:  2026-09-09, from the pg_policies output (supabase/README.md query 2).
--
-- THE HOLE
--
--   policy "Users can update own profile" on public.profiles, for UPDATE
--     qual:       (auth.uid() = id)
--     with_check: (auth.uid() = id)
--
-- That is the correct row restriction and no column restriction at all. RLS
-- gates rows, never columns, so a policy that lets a user update their own row
-- lets them update EVERY column of it -- including is_admin. Any signed-in
-- user can run this from the browser console and become an administrator:
--
--   await supabase.from('profiles').update({ is_admin: true }).eq('id', myId)
--
-- The blast radius is larger than the admin panel. Every policy anywhere in
-- the database that reads is_admin -- directly, or through a helper like the
-- is_platform_admin() defined in supabase/pending.sql -- is reading a value
-- that the user being checked can set. Those policies are not weak; they are
-- unenforced. This file is a prerequisite for pending.sql meaning anything.
--
-- Separately: the app-side gate in app/dashboard/admin/page.tsx is a client
-- render check (`if (!isAdmin) return <Access Denied>`), and every admin
-- mutation goes through the anon client from the browser. So today the admin
-- panel has no server-side enforcement AND no enforceable database boundary
-- underneath it. This file fixes the second half. The first half is separate
-- work.
--
--
-- WHY A TRIGGER AND NOT A COLUMN GRANT
--
-- The other way to protect a single column is a column-level grant, the way
-- supabase/pending.sql protects role_credentials.verified:
--
--   revoke update on public.profiles from authenticated;
--   grant  update (email, full_name, bio, ...) on public.profiles to authenticated;
--
-- That is a good pattern for a five-column table and a bad one here, because
-- it requires enumerating every currently-writable column of profiles, and
-- profiles has around 25 of them and is actively changing -- pending.sql adds
-- active_mode. Any column added later is silently NOT granted, and the next
-- profile save fails in production for a reason nobody will connect back to
-- this file. The trigger names only the column it protects and stays correct
-- as the table grows.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Trigger: only an admin may change is_admin
--
-- Fires on every UPDATE of profiles and returns immediately unless is_admin is
-- actually changing, so the cost on a normal profile save is one function call.
--
-- `is not distinct from` rather than `=` because is_admin is nullable, and
-- null = null is null rather than true -- with `=`, a null-to-null update
-- would fall past the early return into the permission check.
--
-- WHAT IS DELIBERATELY ALLOWED THROUGH
--
--   * service_role -- lib/supabaseAdmin.tsx, the Stripe webhook, any future
--     admin API route. Identified by the role claim on the JWT.
--   * Connections with no JWT at all: the SQL editor, psql, `supabase db
--     push`, and the signup trigger on auth.users. Without this branch, the
--     migration in pending.sql could not run, and neither could this file.
--   * A caller who is ALREADY an admin, promoting or demoting anyone.
--
-- The role claim is read from request.jwt.claims directly rather than through
-- auth.role(), so this does not depend on a helper in the auth schema that
-- Supabase owns and may change. Note that anon and authenticated callers both
-- DO carry a role claim, so neither of them reaches the "no JWT" branch.
--
-- SECURITY DEFINER with an empty search_path: the function reads profiles
-- while profiles is being updated, and must not be subject to profiles' own
-- RLS. An empty search_path means every name below has to be schema-qualified,
-- which is also what stops a search_path attack on a definer function.
--
-- `create or replace` on a deliberately distinctive name. pending.sql argues
-- for plain `create`, so that a name collision aborts rather than silently
-- swapping out a function body other policies depend on -- that argument holds
-- for a generic name like set_updated_at. This name cannot plausibly collide,
-- and re-running a security fix has to be safe.
-- -----------------------------------------------------------------------------

create or replace function public.profiles_guard_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  caller   uuid;
begin
  -- Not touching is_admin: nothing to police.
  if new.is_admin is not distinct from old.is_admin then
    return new;
  end if;

  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- service_role bypasses RLS everywhere else; it bypasses this too.
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- No JWT: a direct database connection. SQL editor, migrations, the
  -- auth.users signup trigger. Not reachable from a browser.
  if jwt_role is null then
    return new;
  end if;

  caller := auth.uid();

  if caller is null then
    raise exception 'Only an administrator may change is_admin.'
      using errcode = '42501';
  end if;

  -- Read as definer, so this cannot be defeated by a policy that hides the
  -- caller's own row from them.
  if not coalesce(
    (select p.is_admin from public.profiles p where p.id = caller),
    false
  ) then
    raise exception 'Only an administrator may change is_admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_admin_escalation() is
  'Blocks is_admin changes from non-admin callers. Required because the '
  '"Users can update own profile" RLS policy restricts rows but not columns, '
  'which made is_admin self-assignable. See supabase/fix-admin-escalation.sql.';

drop trigger if exists profiles_guard_admin_escalation on public.profiles;

create trigger profiles_guard_admin_escalation
  before update on public.profiles
  for each row execute function public.profiles_guard_admin_escalation();


-- -----------------------------------------------------------------------------
-- 2. Replace the profiles INSERT policy
--
-- Current:
--   policy "Enable insert for authenticated users only" on public.profiles
--     for INSERT, with_check: true
--
-- `with_check: true` is not a restriction. Any signed-in user can insert a
-- profiles row with any id and any column values -- including a row belonging
-- to another auth user, and including is_admin = true, which the section 1
-- trigger does not cover because that trigger is BEFORE UPDATE, not INSERT.
--
-- The replacement ties the row to the caller. This closes the INSERT path to
-- is_admin as a side effect: a user may only insert their own row, and a row
-- for their own id already exists (the signup trigger creates it), so the
-- insert conflicts on the primary key.
--
-- (select auth.uid()) rather than a bare auth.uid() so the planner evaluates
-- it once per statement instead of once per row -- the same form used
-- throughout supabase/pending.sql.
--
-- RISK, READ BEFORE RUNNING: if the signup trigger on auth.users is NOT
-- security definer, it inserts as the calling role, and this policy could
-- break new signups. It almost certainly is definer -- it runs as
-- supabase_auth_admin during signup, before the new user has a session to
-- authenticate with, so it could not have satisfied a with_check under the
-- authenticated role either way. The trigger body is still unread
-- (supabase/README.md step 1), so that is reasoned rather than verified.
-- Test one signup after running this. Rollback is at the bottom of this file.
-- -----------------------------------------------------------------------------

drop policy if exists "Enable insert for authenticated users only" on public.profiles;
drop policy if exists "users insert their own profile" on public.profiles;

create policy "users insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 3. Verification
--
-- Run after the above. Expect exactly two rows:
--
--   policy  | users insert their own profile  | (id = ( SELECT auth.uid() AS uid))
--   trigger | profiles_guard_admin_escalation | enabled
--
-- A MISSING trigger row means section 1 did not apply.
--
-- MORE THAN ONE policy row is a finding, not a pass. Permissive policies OR
-- together, so a second INSERT policy left on the table with `true` would
-- defeat section 2 entirely.
-- -----------------------------------------------------------------------------

-- t.tgenabled is "char", not text. Concatenating it against an untyped literal
-- leaves Postgres unable to resolve ||, which fails as
-- `operator is not unique: unknown || char`. The ::text cast is required.
select
  'trigger'       as check_type,
  t.tgname::text  as name,
  case t.tgenabled
    when 'O' then 'enabled'
    else 'NOT ENABLED (tgenabled=' || t.tgenabled::text || ')'
  end             as detail
from pg_trigger t
where t.tgrelid = 'public.profiles'::regclass
  and not t.tgisinternal
  and t.tgname = 'profiles_guard_admin_escalation'

union all

select
  'policy',
  p.policyname::text,
  coalesce(p.with_check, '(no with_check)')
from pg_policies p
where p.schemaname = 'public'
  and p.tablename  = 'profiles'
  and p.cmd        = 'INSERT'

order by check_type, name;


-- -----------------------------------------------------------------------------
-- Rollback, if section 2 breaks signup
--
--   drop policy if exists "users insert their own profile" on public.profiles;
--   create policy "Enable insert for authenticated users only"
--     on public.profiles for insert to authenticated with check (true);
--
-- Do NOT roll back section 1 to fix a signup problem -- it does not touch
-- INSERT and cannot be the cause.
-- -----------------------------------------------------------------------------
