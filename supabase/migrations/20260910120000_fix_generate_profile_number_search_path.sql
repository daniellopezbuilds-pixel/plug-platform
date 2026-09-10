-- =============================================================================
-- Hotfix: signups failing with 42P01 relation "profiles" does not exist
--
-- Applied to the live project by hand first, on 2026-09-10, because signups
-- were down. This file exists so the migration history matches the database.
-- It is idempotent -- `create or replace` -- so pushing it after the manual run
-- is a safe no-op.
--
--
-- WHAT BROKE
--
-- 20260909120000 rewrote handle_new_user() with `set search_path = ''`, which
-- is the correct hardening for a SECURITY DEFINER function: every name it uses
-- has to be schema-qualified, and it cannot be redirected by whatever the
-- caller left in their search_path.
--
-- Every reference inside handle_new_user() *is* qualified. The failure was one
-- level down. public.generate_profile_number() -- the set_profile_number
-- BEFORE INSERT trigger on profiles, which predates all of this and lives in
-- the baseline -- does `select count(*) + 1 from profiles`, unqualified, and
-- has no `SET search_path` of its own.
--
-- A function without its own search_path setting runs with whatever the caller
-- has. The old handle_new_user() was `SET search_path TO 'public'`, so
-- generate_profile_number() inherited 'public' and resolved `profiles` fine.
-- Under `''` it inherits an empty path, `profiles` resolves to nothing, and the
-- insert raises 42P01. The trigger aborts, the transaction rolls back, GoTrue
-- reports "Database error saving new user", and no account is created.
--
-- So the error pointed at handle_new_user() and the cause was in a function it
-- calls. Re-qualifying handle_new_user() would have changed nothing.
--
--
-- WHY FIX THE CALLEE RATHER THAN WIDEN THE CALLER
--
-- The one-statement alternative was to put handle_new_user() back to
-- `search_path TO 'public'`. That restores signups just as fast and leaves the
-- landmine armed: the next SECURITY DEFINER function written with a pinned
-- empty path -- which is the shape we want them all to have -- breaks
-- generate_profile_number() again, and the error will point somewhere else
-- again.
--
-- Pinning the callee fixes it for every caller, present and future, and costs
-- the same single statement. handle_new_user() is left exactly as
-- 20260909120000 wrote it: already correct, and not worth re-running during an
-- incident.
--
--
-- WHAT ELSE IS EXPOSED
--
-- Nine functions in the baseline have no pinned search_path and inherit their
-- caller's:
--
--   generate_profile_number()          <- fixed here; the only one reachable
--                                         from a signup
--   can_message(uuid, uuid)
--   is_conversation_participant(uuid, uuid)
--   notify_connection_accepted()
--   notify_new_applicant()
--   notify_new_connection_request()
--   notify_new_job()
--   notify_new_message()
--   notify_new_review()
--   notify_status_change()
--
-- The notify_* ones are triggers on connections, applications, jobs, messages
-- and reviews; can_message and is_conversation_participant are called from RLS
-- policies. None sits in a signup's call path, so none is fixed here -- an
-- outage is the wrong time to touch nine functions. They are the same latent
-- bug and should be pinned in their own migration.
--
-- role_credentials_touch_updated_at(), created by 20260909120000 with
-- `set search_path = ''`, needs no change: it calls now() and touches no
-- tables, and pg_catalog is always resolvable regardless of search_path.
-- =============================================================================


-- Behaviour is deliberately unchanged: same count(*) + 1, same SP-000000
-- format. The only differences are the qualified public.profiles and the
-- pinned empty search_path. count, lpad and text are all pg_catalog, so they
-- still resolve.
--
-- NOTE, not fixed here: `count(*) + 1` is racy. Two signups landing in the
-- same instant get the same profile_number, and numbers are reused after a
-- delete. That predates this migration and changing the numbering scheme
-- mid-incident would be its own risk. It wants a sequence, in its own change.

create or replace function public.generate_profile_number()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_number integer;
begin
  select count(*) + 1
    into next_number
    from public.profiles;

  new.profile_number :=
    'SP-' || lpad(next_number::text, 6, '0');

  return new;
end;
$$;

comment on function public.generate_profile_number() is
  'Assigns profiles.profile_number on insert. search_path is pinned empty and '
  'public.profiles is qualified: this runs inside handle_new_user(), which is '
  'SECURITY DEFINER with an empty search_path, and an unqualified reference '
  'here fails the whole signup. See the header of '
  'supabase/migrations/20260910120000_fix_generate_profile_number_search_path.sql.';


-- -----------------------------------------------------------------------------
-- Verify
--
-- Run a real signup, then:
--
--   select id, email, account_type, active_mode, role, active_role,
--          profile_number
--   from public.profiles order by created_at desc limit 1;
--
-- A C-10 signup should give company / employer / employer / employer and a
-- non-null profile_number.
--
-- Accounts created while signups were failing do not exist -- the transaction
-- rolled back, so there are no partial rows to clean up. Users who hit the
-- error need to sign up again.
-- -----------------------------------------------------------------------------
