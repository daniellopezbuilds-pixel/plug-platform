-- =============================================================================
-- Who may read a resume, and putting classification where it can be seen
--
-- TWO CHANGES, BOTH ABOUT THE APPLICANT CARD. An employer judging an applicant
-- needs to see who they are; one of the things they need was readable by too
-- many people, and another was readable by nobody but its owner.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Resumes: applications only, not connections
--
-- WHAT THE POLICY ALLOWED BEFORE THIS. "Eligible users can view resumes" was:
--
--     bucket_id = 'resumes' AND (
--       foldername[1] = auth.uid()              -- your own
--       OR public.can_message(foldername[1], auth.uid())
--     )
--
-- and can_message(a, b) is true when EITHER an accepted connection OR an
-- application links the two. So an accepted connection — a marketplace
-- handshake that anybody in the directory can request and that has nothing to
-- do with hiring — granted permanent read access to somebody's resume. A
-- resume carries a home address, a phone number and an employment history;
-- "we connected on a trade platform" is not consent to hand that over.
--
-- WHAT IT ALLOWS NOW: the owner, and an employer who received an application
-- from them. Nothing else.
--
-- DIRECTIONAL, where can_message is symmetric. The rule is "the employer of a
-- job this person applied to", not "either party of an application" — a worker
-- has no business reading the resume of an employer they applied to, and the
-- symmetric form allowed exactly that.
--
-- WHY A NEW FUNCTION RATHER THAN NARROWING can_message. That function is also
-- the WITH CHECK of the "Users can add eligible participants" policy on
-- conversation_participants, where the connections branch is correct and
-- load-bearing — two connected users are meant to be able to message each
-- other. Narrowing it here would silently break messaging for every
-- connection on the platform.
--
-- CREATE/DROP POLICY on storage.objects works from a migration even though the
-- table is owned by supabase_storage_admin; Supabase grants the postgres role
-- policy management there, which is what makes the dashboard editor work. See
-- the header of 20260908000000, which proves it from a failed push.
-- -----------------------------------------------------------------------------

create or replace function public.can_view_resume(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_owner = p_viewer
    or exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.worker_id = p_owner
        and j.user_id = p_viewer
    );
$$;

comment on function public.can_view_resume(uuid, uuid) is
  'Whether p_viewer may read p_owner''s resume: they own it, or they posted a '
  'job p_owner applied to. DELIBERATELY NARROWER THAN can_message(), which '
  'also returns true for an accepted connection — a directory handshake is '
  'not consent to hand over an address and a work history. Directional on '
  'purpose: an applicant may not read an employer''s resume.';

revoke all on function public.can_view_resume(uuid, uuid) from anon;
grant execute on function public.can_view_resume(uuid, uuid) to authenticated, service_role;

drop policy if exists "Eligible users can view resumes" on storage.objects;

create policy "Eligible users can view resumes"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and public.can_view_resume(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  );

-- The INSERT / UPDATE / DELETE policies are unchanged and stay owner-only:
-- "Workers can upload/update/delete their own resume", all
-- foldername[1] = auth.uid(). Nothing about who may WRITE a resume changes
-- here.


-- -----------------------------------------------------------------------------
-- 2. profiles.classification -- so an employer can see it
--
-- WHERE IT LIVES TODAY AND WHY THAT DOES NOT WORK. An electrician's
-- classification is collected at signup into signup_fields, which lands in
-- role_credentials.fields and in raw_user_meta_data. role_credentials is
-- owner-and-admin only, and correctly so — it holds CSLB licence numbers.
-- So an employer reading an applicant card cannot see the applicant's
-- classification at all, and no amount of front-end work changes that.
--
-- THIS IS THE SAME PROBLEM years_experience HAD, and it gets the same answer.
-- From profileColumn in lib/signupRoles.tsx: "A fact that has to appear on
-- somebody ELSE'S screen cannot live there." Classification is printed on an
-- applicant card, so it has to be a column.
--
-- NOT STORED IN BOTH PLACES. The field is marked profileColumn in
-- lib/signupRoles.tsx alongside years_experience, so splitSignupValues() routes
-- it to the column and the credentials form stops rendering it — one writer,
-- and editing it no longer trips the role_credentials trigger that clears
-- `verified`. Losing a licence verification because somebody corrected their
-- classification would be absurd.
--
-- SAME SEVEN STRINGS as ELECTRICIAN_CLASSIFICATIONS and as jobs.classification
-- from 20260922170000. A job's requirement and a worker's classification are
-- now the same vocabulary in two columns, which is what makes matching them a
-- comparison rather than a translation.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists classification text;

alter table public.profiles drop constraint if exists profiles_classification_ck;
alter table public.profiles
  add constraint profiles_classification_ck
    check (
      classification is null
      or classification in (
        'Apprentice',
        'Trainee',
        'Journeyman',
        'General Electrician',
        'Residential',
        'Fire/Life Safety',
        'Voice-Data-Video'
      )
    );

comment on column public.profiles.classification is
  'How this person is classified on the job. A column rather than a '
  'signup_fields key because it is printed on other people''s screens — the '
  'applicant card and the public profile — and role_credentials is owner-only. '
  'Same seven strings as jobs.classification and ELECTRICIAN_CLASSIFICATIONS.';


-- -----------------------------------------------------------------------------
-- 3. Backfill from the credentials that already hold it
--
-- Reads role_credentials rather than raw_user_meta_data: both carry the value,
-- and the table is the server-held one. The CHECK above would reject anything
-- outside the list, so the update filters to known values rather than letting
-- one junk row abort the whole statement.
--
-- Idempotent: `classification is null` means a second run matches nothing.
-- -----------------------------------------------------------------------------

update public.profiles p
set classification = rc.fields ->> 'classification'
from public.role_credentials rc
where rc.profile_id = p.id
  and p.classification is null
  and rc.fields ->> 'classification' in (
    'Apprentice', 'Trainee', 'Journeyman', 'General Electrician',
    'Residential', 'Fire/Life Safety', 'Voice-Data-Video'
  );


-- -----------------------------------------------------------------------------
-- 4. handle_new_user -- carry classification onto the row at signup
--
-- Reproduced whole, because a function is replaced whole. THE ONLY DIFFERENCE
-- from 20260918120000 is `classification` in the insert column list and one
-- more nullif(btrim(...)) in the values — everything else, including the
-- account_type derivation, the legacy_role mirror and the role_keys block, is
-- restated verbatim.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  sign_type   text;
  acct_type   text;
  legacy_role text;
  start_mode  text;
  role_keys   text[];
begin
  sign_type := nullif(btrim(meta ->> 'signup_type'), '');

  acct_type := case sign_type
    when 'c10'         then 'company'
    when 'electrician' then 'individual'
    when 'instructor'  then 'individual'
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
    location, contact_number, years_experience, classification
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
    nullif(btrim(meta ->> 'years_experience'), ''),
    -- An unrecognised value would violate profiles_classification_ck and take
    -- the whole signup down with it, so anything off-list is stored as absent.
    -- Metadata is client-writable; this is the one value here a caller chooses
    -- that is constrained.
    case
      when nullif(btrim(meta ->> 'classification'), '') in (
        'Apprentice', 'Trainee', 'Journeyman', 'General Electrician',
        'Residential', 'Fire/Life Safety', 'Voice-Data-Video'
      ) then btrim(meta ->> 'classification')
      else null
    end
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
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profiles row from signup metadata and seeds account_roles. '
  'Carries location, contact_number, years_experience and classification onto '
  'the row — the four signup answers that have to be readable by other people '
  'and therefore cannot live in signup_fields. An off-list classification is '
  'stored as NULL rather than allowed to fail the signup on a CHECK.';
