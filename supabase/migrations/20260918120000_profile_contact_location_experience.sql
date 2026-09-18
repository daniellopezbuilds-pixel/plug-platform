-- Profile details asked at signup: contact number, city, years of experience
-- =============================================================================
--
-- Signup was revised to require a contact number, a city and (for electricians)
-- a years-of-experience band. Two of the three had nowhere to land:
--
--   * contact_number  had NO COLUMN AT ALL. Signup has always written it into
--                     auth.users.raw_user_meta_data and nothing has ever read
--                     it back, so every number collected since launch has been
--                     write-only. No admin query, no directory, no export could
--                     see it.
--   * location        has a column, but handle_new_user() never wrote it. The
--                     app was filling it in from the browser after signUp,
--                     which cannot work when email confirmation is on (it is,
--                     on production) because signUp returns no session to write
--                     with. Section 4 moves that into the trigger, which is the
--                     only writer that runs on every path.
--   * years_experience had a column of the WRONG TYPE. It is an integer, and
--                     the form now asks for a band. See section 2.
--
-- Nothing here is reversible by a later migration alone: section 2 converts
-- integers to bands and the original numbers are not recoverable from the
-- result. It was reviewed against the real production values first (3, 9, 10,
-- 12, 15, 22 and five NULLs) and every one of them converts cleanly.
--
-- Applied to staging first, then production. See supabase/README.md.


-- -----------------------------------------------------------------------------
-- 1. profiles.contact_number -- new column, backfilled from metadata
--
-- Plain nullable text, like every other self-declared field on this table. NOT
-- verified and not unique: two people at one company legitimately share a
-- number, and nothing sends to it.
--
-- No format CHECK. The form counts digits rather than matching a shape, because
-- (555) 123-4567 and +1 555 123 4567 are the same number written by two people
-- who are both right, and a constraint here would reject valid international
-- numbers the day the first one arrives.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists contact_number text;

comment on column public.profiles.contact_number is
  'Self-declared phone number, collected at signup and editable on the profile '
  'page. Never verified. Before 20260918120000 this lived only in '
  'auth.users.raw_user_meta_data, where no query could reach it.';

-- Backfill. Metadata is client-written, so these are user-claimed values -- but
-- they are the same user-claimed values the form would collect today, and the
-- column carries no more authority than the metadata key did.
--
-- Guarded on `p.contact_number is null` so re-running cannot overwrite an edit
-- made after this migration lands.
update public.profiles p
set contact_number = nullif(btrim(u.raw_user_meta_data ->> 'contact_number'), '')
from auth.users u
where u.id = p.id
  and p.contact_number is null
  and nullif(btrim(u.raw_user_meta_data ->> 'contact_number'), '') is not null;


-- -----------------------------------------------------------------------------
-- 2. profiles.years_experience -- integer to text band
--
-- WHY A BAND AND NOT A NUMBER. An integer invites a precision nobody has.
-- People round, the answer is stale the day after it is given, and no reader of
-- a profile card has ever needed to know 7 rather than 8. The four surfaces
-- that render this column -- the marketplace card, the applicant card, the
-- public profile page and the preview modal -- all printed "{n} years
-- experience", which presented that invented precision as fact.
--
-- The bands are EXPERIENCE_BANDS in lib/signupRoles.tsx.
--
-- NO CHECK CONSTRAINT, deliberately, and the same call as `trade` and
-- `location`: this is display vocabulary, not schema. Adding or renaming a band
-- should be a one-line edit to a TypeScript array, not a migration. The cost is
-- that a client can write any string here; it is a self-declared field that
-- grants nothing, exactly like `trade`.
--
-- Boundaries: <=2, <=5, <=10, else. A stored 10 lands in '6-10 years' rather
-- than '10+ years' because the band labels are inclusive at the top and the
-- lower band is the one that cannot overstate. Negative and zero values fall
-- into '0-2 years'.
--
-- Checked first: nothing depends on this column -- no view, no rule, no
-- generated column -- so the type change needs no drop-and-recreate.
-- -----------------------------------------------------------------------------

alter table public.profiles
  alter column years_experience type text
  using case
    when years_experience is null then null
    when years_experience <= 2    then '0-2 years'
    when years_experience <= 5    then '3-5 years'
    when years_experience <= 10   then '6-10 years'
    else                               '10+ years'
  end;

comment on column public.profiles.years_experience is
  'Self-declared experience BAND, e.g. ''3-5 years''. Free text by design -- the '
  'band list is EXPERIENCE_BANDS in lib/signupRoles.tsx and changing it must not '
  'need a migration. Was an integer until 20260918120000; the conversion is one '
  'way and the original numbers are gone.';


-- -----------------------------------------------------------------------------
-- 3. profiles.location -- backfill from metadata
--
-- A no-op on both projects today (nothing has written the metadata key yet),
-- and included anyway so that any account created between the signup form
-- shipping and this migration landing is not left with its city stranded in
-- metadata. Cheap insurance against an ordering the deploy does not control.
-- -----------------------------------------------------------------------------

update public.profiles p
set location = nullif(btrim(u.raw_user_meta_data ->> 'location'), '')
from auth.users u
where u.id = p.id
  and nullif(btrim(p.location), '') is null
  and nullif(btrim(u.raw_user_meta_data ->> 'location'), '') is not null;


-- -----------------------------------------------------------------------------
-- 4. handle_new_user() -- carry the three fields onto the row
--
-- Reproduced in full from 20260916130000_badges.sql with ONE change: three more
-- values read out of metadata and written into the insert. Everything else --
-- the account_type and signup_type validation, the legacy role columns, the
-- account_roles and role_credentials inserts -- is byte-for-byte the previous
-- version.
--
-- KEEP search_path = '' AND KEEP EVERY REFERENCE QUALIFIED. See the incident
-- note in supabase/README.md: pinning this function to an empty search_path is
-- the correct hardening, and it took every signup down because
-- generate_profile_number() -- fired by the set_profile_number trigger on
-- profiles -- was unpinned and inherited the empty path. That callee is pinned
-- now (20260910120000). This version calls nothing new.
--
-- WHY THE TRIGGER RATHER THAN THE CLIENT. The browser cannot reliably write
-- these. With email confirmation on, signUp returns no session, so there is no
-- authenticated connection to run an update with until the user clicks the link
-- -- and a reconciliation on first dashboard load (which is what this replaces)
-- is a second writer for the same fact, running at a different time, that has to
-- be kept in step with this one for ever. One writer, at row creation.
--
-- These three are NOT VALIDATED against anything, unlike account_type and
-- signup_type above them. They are self-declared contact details that grant
-- nothing and gate nothing. signup_type is validated because it is a licence
-- claim; a city is not.
--
-- Google accounts do not come through here with any of this: the trigger fires
-- at the OAuth callback, where the metadata is Google's and carries none of
-- these keys. app/api/onboarding/complete/route.tsx writes them afterwards,
-- with service_role, from the form that collects them.
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
  sign_type   text;
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

  -- signup_type, validated against the four known values. NULL rather than a
  -- guess when it is missing or unrecognised: no label is correct, and a wrong
  -- label is a claim about someone's licence.
  sign_type := case meta ->> 'signup_type'
    when 'c10'         then 'c10'
    when 'electrician' then 'electrician'
    when 'instructor'  then 'instructor'
    when 'brand'       then 'brand'
    else null
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
    account_type, active_mode, signup_type,
    role, active_role,
    location, contact_number, years_experience
  )
  values (
    new.id,
    new.email,
    meta ->> 'full_name',
    0,
    acct_type,
    start_mode,
    sign_type,
    legacy_role,
    legacy_role,
    -- nullif so an empty string from a form that submitted a blank optional
    -- field is stored as absent rather than as "present but empty", which is
    -- the difference every `is null` check downstream depends on.
    nullif(btrim(meta ->> 'location'), ''),
    nullif(btrim(meta ->> 'contact_number'), ''),
    nullif(btrim(meta ->> 'years_experience'), '')
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
  'therefore user-claimed: role keys are validated against public.roles, '
  'signup_type and account_type are validated against their allowed values, and '
  'credentials are always stored verified = false. location, contact_number and '
  'years_experience are stored as given -- self-declared contact details that '
  'gate nothing. Still writes the deprecated role / active_role columns because '
  'is_messaging_blocked() depends on role. See docs/signup-and-brand-spec.md s1.';
