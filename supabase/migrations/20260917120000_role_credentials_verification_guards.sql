-- ============================================================================
-- role_credentials: verification integrity
-- ============================================================================
--
-- Two triggers, one invariant: a `verified` flag on this table must only ever
-- mean "an administrator checked THESE field values". Both halves of that are
-- currently unenforced, and they are the same problem seen from two directions,
-- which is why they are in one migration rather than two.
--
-- Context. The profile page is gaining an editor for the credentials entered at
-- signup — licence numbers, certificate names, classifications. Until now those
-- were read-only, so neither hole below was reachable from the UI.
--
--
-- 1. UPDATE: editing a credential must clear its verification.
--
--    20260909120000 revoked UPDATE on this table from `authenticated` and
--    granted back only `fields`, so a user cannot set `verified` themselves.
--    That stops the direct attack and misses the obvious one: get verified
--    honestly, then change the licence number. The row keeps verified = true
--    and now vouches for a value nobody checked.
--
--    THIS IS A TRIGGER RATHER THAN A SERVER ROUTE ON PURPOSE. A route would
--    only bind callers that use it, and `grant update (fields)` means the
--    browser can always write this column directly and skip it. A route would
--    make the reset a convention; here it has to be an invariant. Doing it in
--    the database also covers writers that do not exist yet — an admin tool, a
--    backfill, a script.
--
--
-- 2. INSERT: nobody may create a credential that is already verified.
--
--    The same migration revoked UPDATE but left INSERT alone, and the RLS
--    policy ("users create their own credentials") checks only that the row
--    belongs to the caller. So a user holding a role with no credentials row
--    could insert one with verified = true and verified_at = now(), satisfying
--    the CHECK constraint and skipping review entirely. Latent so far, because
--    nothing in the app reads `verified` yet; live the moment the editor ships.
--
--    Guarded rather than granted away: revoking INSERT and re-granting a column
--    list would have to be revisited every time a column is added to this
--    table, and a column added later is silently un-granted. The same reasoning
--    fix-admin-escalation.sql used for profiles.
--
-- Both functions follow the house guard shape from
-- profiles_guard_admin_escalation() and profiles_guard_signup_type(): SECURITY
-- DEFINER, empty search_path with every reference schema-qualified, and
-- service_role plus no-JWT connections allowed through.
--
-- On the empty search_path: see the 2026-09-10 incident in supabase/README.md.
-- Pinning a caller changes name resolution for everything it calls, so every
-- reference below is qualified — public.profiles, auth.uid().
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Editing fields clears verification
-- ----------------------------------------------------------------------------

create or replace function public.role_credentials_reset_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `is distinct from` rather than <>: jsonb comparison has to be NULL-safe,
  -- and a row moving between NULL and '{}' is a change like any other.
  if new.fields is distinct from old.fields then
    new.verified    := false;
    new.verified_at := null;
  end if;

  return new;
end;
$$;

comment on function public.role_credentials_reset_verification() is
  'Clears verified/verified_at whenever role_credentials.fields changes, so a '
  'verified flag can never outlive the values it was granted against. Applies '
  'to every caller including service_role and admins: an edit and a '
  'verification in one statement is an edit, and should be re-reviewed.';

drop trigger if exists role_credentials_reset_verification on public.role_credentials;

create trigger role_credentials_reset_verification
  before update on public.role_credentials
  for each row execute function public.role_credentials_reset_verification();


-- ----------------------------------------------------------------------------
-- 2. Only an admin may create an already-verified credential
-- ----------------------------------------------------------------------------

create or replace function public.role_credentials_guard_insert_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  caller   uuid;
begin
  -- The ordinary case: a new credential claiming nothing. The table's own
  -- CHECK keeps verified and verified_at consistent with each other, so this
  -- only has to notice that neither is set.
  if not coalesce(new.verified, false) and new.verified_at is null then
    return new;
  end if;

  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- service_role, and connections with no JWT at all (SQL editor, migrations,
  -- the signup trigger), are allowed through -- matching the profiles guards.
  if jwt_role = 'service_role' then
    return new;
  end if;

  if jwt_role is null then
    return new;
  end if;

  caller := auth.uid();

  if caller is null then
    raise exception 'Only an administrator may create a verified credential.'
      using errcode = '42501';
  end if;

  if not coalesce(
    (select p.is_admin from public.profiles p where p.id = caller),
    false
  ) then
    raise exception 'Only an administrator may create a verified credential.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.role_credentials_guard_insert_verified() is
  'Blocks a non-admin from inserting a role_credentials row that is already '
  'verified. The "users create their own credentials" RLS policy gates rows, '
  'not columns, and INSERT was never column-granted the way UPDATE was. '
  'Mirrors profiles_guard_signup_type().';

drop trigger if exists role_credentials_guard_insert_verified on public.role_credentials;

create trigger role_credentials_guard_insert_verified
  before insert on public.role_credentials
  for each row execute function public.role_credentials_guard_insert_verified();
