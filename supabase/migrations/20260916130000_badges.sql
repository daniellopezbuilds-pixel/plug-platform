-- =============================================================================
-- Badge system v1: account type labels, three badges, and the review flow
--
-- STATUS: APPLIED 2026-09-16, to staging and then production.
--
-- THE FILE BELOW IS WHAT RAN. Do not edit it to add something that was left
-- out -- the version is recorded as applied and will never run again, so an
-- edit here changes no database and leaves this file describing a table it did
-- not build. That already happened once: badges.icon was added to the create
-- table in this file after it had been applied, which is why staging returned
-- 400 on every badge query. The column now arrives in
-- 20260916140000_badge_icons.sql, where it can actually run.
--
-- Spec: the badge plan agreed in the 2026-09-16 thread. There is no badge
-- document in docs/ -- if one turns up, reconcile against it before pushing.
--
-- WHAT THIS ADDS
--   profiles.signup_type   the account type label, as a real server-held column
--   badges                 reference table, seeded with three
--   user_badges            one row per badge a profile holds or has requested
--   public_badges          view -- the only thing other users may read
--   user_badge_reviews     admin-only audit trail
--
-- THREE DECISIONS BAKED IN, all agreed before writing:
--
--   1. No stored 'expired' status. Expiry is derived from expires_at at read
--      time, in the public_badges view and nowhere else. A stored status with
--      no writer is the advertisement_metrics_daily mistake (spec s4.6) and the
--      is_active-versus-status trap (spec s6) arriving together.
--   2. 'rejected' is in the status vocabulary. Without it a rejection reason
--      has nowhere to live and a refused request sits at pending for ever.
--   3. employer_verified folds into business_verified, with the old column kept
--      in sync by trigger for one release. Section 8.
--   4. A review records WHAT was checked, in columns, not a prose note --
--      licence number as verified, status seen, expiry seen, and the vintage of
--      the record consulted. Section 6. CSLB publishes a free weekly Master
--      List with exactly those fields, so the same columns receive the import
--      when it is built.
--
-- ============================== READ BEFORE SWITCHING ON =====================
-- license_verified and business_verified SHIP INACTIVE (section 3). They exist
-- in the schema, seeded and constrained, but are not offered to users, not
-- listed in the admin panel, and not rendered beside a name -- public_badges
-- joins badges and filters on active.
--
-- Turning business_verified on is TWO statements, not one. The
-- employer_verified backfill in section 7b goes stale the moment this migration
-- lands, because the existing admin panel keeps writing
-- profiles.employer_verified and nothing writes the badge. Re-run the backfill
-- at flip time rather than trying to keep the two in sync in the meantime --
-- that was considered and rejected in section 7b, because a reverse trigger
-- would fire user_badges_validate() inside the existing approve() call and
-- break a flow that works today.
--
--   begin;
--
--   update public.badges set active = true
--    where key in ('license_verified', 'business_verified');
--
--   insert into public.user_badges (profile_id, badge_key, status, awarded_at)
--   select p.id, 'business_verified', 'verified', now()
--   from public.profiles p
--   where p.employer_verified = true
--   on conflict (profile_id, badge_key) do nothing;
--
--   commit;
--
-- Do that in one transaction, so there is no window where the badge is visible
-- and the backfill has not caught up.
-- =============================================================================
--
-- WHAT IS NOT HERE
--   Union verification stays exactly as it is. union_status is a self-declared
--   attribute with a verification flag, not a badge: "Non-Union, verified" is a
--   fact about someone, not something they hold, it has no expiry and no locked
--   state, and UnionBadge.tsx renders the unverified case too -- which a badge
--   table cannot express. Folding it in would make a badge whose presence and
--   whose absence both mean something.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. profiles.signup_type -- the account type label
--
-- WHY THIS COLUMN HAS TO EXIST
--
-- signup_type currently lives only in auth.users.raw_user_meta_data. Two
-- properties of that make it unusable for a label beside a name, and both are
-- already documented in hooks/useActiveRole.tsx:
--
--   * It is readable only for the signed-in user. Other people's metadata is
--     not exposed to the client at all, so a feed post, a comment or an
--     applicant card has no way to reach it.
--   * It is CLIENT-WRITABLE. Any signed-in user can set it to anything via
--     supabase.auth.updateUser. A label sourced from it would be
--     self-assignable -- anyone could display "C-10 Contractor" beside their
--     name with one console call. In a compliance product that is an
--     impersonation vector, not a cosmetic bug.
--
-- So the label needs a server-held column, and badge eligibility keys off the
-- same column rather than off the metadata claim. CLAUDE.md: never gate
-- anything on user_metadata.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists signup_type text;

alter table public.profiles
  drop constraint if exists profiles_signup_type_ck;

alter table public.profiles
  add constraint profiles_signup_type_ck
  check (
    signup_type is null
    or signup_type in ('c10', 'electrician', 'instructor', 'brand')
  );

comment on column public.profiles.signup_type is
  'What the account signed up as: c10 | electrician | instructor | brand. '
  'Server-held and guarded by profiles_guard_signup_type() -- deliberately NOT '
  'read from raw_user_meta_data, which is client-writable and readable only for '
  'the signed-in user. Drives the label beside a name and badge eligibility. '
  'NULL for accounts predating the current signup form.';


-- 1a. Backfill, in order of how much the source can be trusted.
--
--   1. account_roles -- written by handle_new_user() and validated against the
--      seeded roles table, so it is a server-held fact. Best source.
--   2. The raw_user_meta_data claim, re-validated against the four known
--      values. A claim, but one the account made about itself at signup, and
--      the only source for brand accounts created through the form.
--   3. account_type = 'brand'. Brands hold no account_roles rows at all
--      (roleKeysFor returns [] for brand), so this is the only signal left.
--
-- DELIBERATELY NOT MAPPED: account_type = 'company' -> 'c10'.
--
-- account_type 'company' is derived from the legacy role 'employer', which
-- every pre-signup-form account carries by default. Mapping it to c10 would
-- print "C-10 Contractor" beside the name of anyone who ever had
-- role = 'employer' -- a licence claim the database has no evidence for. Those
-- rows stay NULL and render no label, which is what
-- app/dashboard/profile/page.tsx already does for accounts with no signup_type.
update public.profiles p
set signup_type = src.resolved
from (
  select
    p2.id,
    coalesce(
      (
        select case ar.role_key
                 when 'contractor'  then 'c10'
                 when 'electrician' then 'electrician'
                 when 'instructor'  then 'instructor'
               end
        from public.account_roles ar
        where ar.profile_id = p2.id
          and ar.role_key in ('contractor', 'electrician', 'instructor')
        order by ar.role_key
        limit 1
      ),
      (
        select case u.raw_user_meta_data ->> 'signup_type'
                 when 'c10'         then 'c10'
                 when 'electrician' then 'electrician'
                 when 'instructor'  then 'instructor'
                 when 'brand'       then 'brand'
               end
        from auth.users u
        where u.id = p2.id
      ),
      case p2.account_type when 'brand' then 'brand' end
    ) as resolved
  from public.profiles p2
) src
where p.id = src.id
  and p.signup_type is null
  and src.resolved is not null;


-- 1b. Guard: signup_type is not self-assignable.
--
-- Same problem and same shape as is_admin. The "Users can update own profile"
-- policy restricts rows but not columns, so without this any user could set
-- their own signup_type, award themselves the C-10 label, and -- because badge
-- eligibility keys off this column -- make themselves eligible for License
-- Verified.
--
-- A SEPARATE trigger rather than an edit to profiles_guard_admin_escalation():
-- that function is in the baseline and guards a different column. Replacing it
-- to bolt on a second rule risks the is_admin guard for no gain. Checked
-- against the baseline 2026-09-16: no function of this name exists.
create or replace function public.profiles_guard_signup_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  caller   uuid;
begin
  if new.signup_type is not distinct from old.signup_type then
    return new;
  end if;

  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  -- service_role, and connections with no JWT at all (SQL editor, migrations,
  -- the signup trigger), are allowed through -- matching the is_admin guard.
  if jwt_role = 'service_role' then
    return new;
  end if;

  if jwt_role is null then
    return new;
  end if;

  caller := auth.uid();

  if caller is null then
    raise exception 'Only an administrator may change signup_type.'
      using errcode = '42501';
  end if;

  if not coalesce(
    (select p.is_admin from public.profiles p where p.id = caller),
    false
  ) then
    raise exception 'Only an administrator may change signup_type.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_signup_type() is
  'Blocks signup_type changes from non-admin callers. Required because the '
  '"Users can update own profile" RLS policy restricts rows but not columns, '
  'which would make the account-type label and badge eligibility '
  'self-assignable. Mirrors profiles_guard_admin_escalation().';

drop trigger if exists profiles_guard_signup_type on public.profiles;

create trigger profiles_guard_signup_type
  before update on public.profiles
  for each row execute function public.profiles_guard_signup_type();


-- -----------------------------------------------------------------------------
-- 2. handle_new_user() -- write signup_type at signup
--
-- Reproduced in full from 20260909120000 with one addition: sign_type, resolved
-- and validated the same way account_type already is, and written into the
-- profiles insert. Everything else is unchanged.
--
-- KEEP search_path = '' AND KEEP EVERY REFERENCE QUALIFIED. See the incident
-- note in supabase/README.md: pinning this function to an empty search_path is
-- the correct hardening, and it took every signup down because
-- generate_profile_number() -- fired by the set_profile_number trigger on
-- profiles -- was unpinned and inherited the empty path. That callee is pinned
-- now (20260910120000). This version calls nothing new.
--
-- It does now fire one additional trigger indirectly: profiles_award_early_member
-- (section 7), which is AFTER INSERT on profiles. That function is pinned to an
-- empty search_path and fully qualified, for the same reason.
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
    role, active_role
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
  'therefore user-claimed: role keys are validated against public.roles, '
  'signup_type and account_type are validated against their allowed values, and '
  'credentials are always stored verified = false. Still writes the deprecated '
  'role / active_role columns because is_messaging_blocked() depends on role. '
  'See docs/signup-and-brand-spec.md s1.';


-- -----------------------------------------------------------------------------
-- 3. badges -- reference table, seeded
--
-- signup_types, not account_types. The eligibility vocabulary in the plan is
-- c10 | electrician | instructor | brand, which is profiles.signup_type.
-- profiles.account_type is a DIFFERENT three words (company | individual |
-- brand) and cannot tell an electrician from an instructor. Naming the column
-- after the vocabulary it actually holds is the whole lesson of spec s4.3.
--
-- requires_expiry is not in the original plan and is added deliberately: the
-- "license_verified takes an expiry date at approval" rule is then data, not a
-- hardcoded badge key in a trigger and again in a form.
-- -----------------------------------------------------------------------------

create table if not exists public.badges (
  key             text primary key,
  label           text        not null,
  description     text        not null,
  category        text        not null,
  signup_types    text[]      not null default '{}',
  requires_review boolean     not null default true,
  requires_expiry boolean     not null default false,
  sort_order      integer     not null default 0,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),

  constraint badges_signup_types_ck
    check (signup_types <@ array['c10', 'electrician', 'instructor', 'brand']::text[]),
  constraint badges_category_ck
    check (category in ('verification', 'community'))
);

comment on table public.badges is
  'Reference data, seeded here and not user-editable. signup_types lists which '
  'profiles.signup_type values may hold the badge. See the badge plan.';

comment on column public.badges.requires_expiry is
  'When true, a badge cannot be set to verified without an expires_at. '
  'Enforced by user_badges_validate(). True for license_verified: a licence '
  'has a real expiry date on the CSLB record, and the badge should carry that '
  'date rather than an arbitrary one.';

-- do update rather than do nothing: these strings are user-facing copy, and
-- making the migration the single source for them means a wording fix is an
-- edit here rather than a new migration. The roles seed in 20260909120000 uses
-- do nothing; this is a deliberate departure, not an inconsistency.
-- ACTIVE = FALSE ON BOTH REVIEW BADGES, deliberately and for now.
--
-- They are seeded so the schema, the constraints and the CSLB review columns
-- are in place and pushed once. They are not offered to users, not listed in
-- the admin panel, and not rendered beside a name -- public_badges joins
-- badges and filters on active, so an inactive badge is invisible even if a
-- row exists for it.
--
-- Turn them on when someone owns the review queue: one UPDATE, no migration.
--   update public.badges set active = true
--    where key in ('license_verified', 'business_verified');
--
-- Read section 7b before doing that -- the employer_verified backfill goes
-- stale while business_verified is inactive, and needs one re-sync at flip time.
insert into public.badges
  (key, label, description, category, signup_types, requires_review, requires_expiry, sort_order, active)
values
  (
    'license_verified',
    'License Verified',
    'An administrator has checked this licence number against the state licensing board.',
    'verification',
    array['c10', 'electrician', 'instructor'],
    true,
    true,
    1,
    false
  ),
  (
    'business_verified',
    'Business Verified',
    'An administrator has confirmed this is a registered business.',
    'verification',
    array['c10', 'brand'],
    true,
    false,
    2,
    false
  ),
  (
    'early_member',
    'Early Member',
    'One of the first 100 accounts on the platform.',
    'community',
    array['c10', 'electrician', 'instructor', 'brand'],
    false,
    false,
    3,
    true
  )
on conflict (key) do update set
  label           = excluded.label,
  description     = excluded.description,
  category        = excluded.category,
  signup_types    = excluded.signup_types,
  requires_review = excluded.requires_review,
  requires_expiry = excluded.requires_expiry,
  sort_order      = excluded.sort_order;
  -- active is NOT in the do update set, on purpose. Re-running this migration
  -- must never switch a badge someone deliberately turned on back off.


-- -----------------------------------------------------------------------------
-- 4. user_badges -- one row per badge held or requested
--
-- NO 'expired' STATUS. Expiry is derived from expires_at wherever a badge is
-- read, and the derivation lives in the public_badges view (section 5) so there
-- is one copy of it. Storing 'expired' would need something to write it --
-- there is no cron in this project -- and a status nothing writes reports the
-- wrong answer for ever.
--
-- submitted_fields holds what the user supplied with the request: the licence
-- number, the business details. It is NOT world-readable -- see the RLS in
-- section 9 and the view in section 5. Only the owner and an admin see it.
--
-- WHY NOT role_credentials.fields, which already exists for this: it is keyed
-- (profile_id, role_key), and business_verified is offered to brand accounts,
-- which hold no account_roles rows and therefore can have no role_credentials
-- row at all. The two tables stay separate; role_credentials keeps what signup
-- collected, user_badges keeps what a badge request supplied.
-- -----------------------------------------------------------------------------

create table if not exists public.user_badges (
  id               uuid        primary key default gen_random_uuid(),
  profile_id       uuid        not null references public.profiles (id) on delete cascade,
  badge_key        text        not null references public.badges (key)  on update cascade,
  status           text        not null default 'pending',
  submitted_fields jsonb       not null default '{}'::jsonb,
  requested_at     timestamptz not null default now(),
  awarded_at       timestamptz,
  expires_at       timestamptz,
  rejection_reason text,
  reviewed_by      uuid        references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,

  unique (profile_id, badge_key),

  constraint user_badges_status_ck
    check (status in ('pending', 'verified', 'rejected', 'revoked')),

  -- verified always has an award date. revoked keeps the one it had, so this is
  -- one-directional rather than an iff -- unlike role_credentials_verified_at_ck,
  -- which can be an iff because that column never has a third state.
  constraint user_badges_awarded_at_ck
    check (status <> 'verified' or awarded_at is not null),

  -- A rejection the user cannot read is the thing this whole status exists to
  -- prevent, so the reason is mandatory and cannot be whitespace.
  constraint user_badges_rejection_reason_ck
    check (status <> 'rejected' or coalesce(btrim(rejection_reason), '') <> '')
);

comment on table public.user_badges is
  'One row per badge a profile holds or has requested. Not readable by other '
  'users -- submitted_fields carries licence and business details. Other '
  'people read public.public_badges instead.';

comment on column public.user_badges.expires_at is
  'When the badge stops counting as verified. There is no stored expired '
  'status: public_badges derives it from this column at read time. NULL means '
  'no expiry.';

comment on column public.user_badges.rejection_reason is
  'Shown to the user. The admin''s own record of what they checked goes in '
  'user_badge_reviews.notes, which the user cannot read.';

-- The admin queue. Partial, because pending is a small slice of the table and
-- the only status anyone lists by.
create index if not exists user_badges_pending_idx
  on public.user_badges (requested_at)
  where status = 'pending';

-- The batched read behind the check mark beside a name: one query per list,
-- profile_id = any($1). The unique constraint already indexes profile_id first,
-- so this covers the badge_key direction for "who holds X".
create index if not exists user_badges_badge_key_idx
  on public.user_badges (badge_key);


-- -----------------------------------------------------------------------------
-- 5. public_badges -- the only badge data other users may read
--
-- user_badges holds licence numbers and rejection reasons. The check mark
-- beside a name needs none of that: it needs to know which badges a profile
-- currently holds. This view is that, and nothing else.
--
-- It also derives expiry, in one place. `expires_at > now()` here is the only
-- definition of "still verified" in the database.
--
-- SECURITY_INVOKER IS OFF ON PURPOSE. The view is owned by the migration role,
-- so it reads user_badges as its owner and is not subject to that table's RLS.
-- That is what lets an authenticated user see someone else's verified badge
-- without being able to select the underlying row. The filter is in the view
-- instead. Supabase's advisor flags this shape as "security definer view" --
-- that warning is expected here and the reason is this paragraph.
-- -----------------------------------------------------------------------------

-- The join on badges is what makes active = false actually mean something. An
-- inactive badge is invisible here however many verified rows exist for it,
-- which is what lets license_verified and business_verified sit in the schema,
-- seeded and backfilled, without appearing beside anyone's name.
-- category is exposed because the check mark beside a name must mean VERIFIED,
-- not "holds any badge". early_member is a community badge -- rendering a check
-- for it would tell every viewer that an account had been identity-checked
-- when all it did was sign up early. The client filters on
-- category = 'verification'; this column is how it can.
create or replace view public.public_badges as
select
  ub.profile_id,
  ub.badge_key,
  ub.awarded_at,
  ub.expires_at,
  b.category
from public.user_badges ub
join public.badges b on b.key = ub.badge_key
where b.active
  and ub.status = 'verified'
  and (ub.expires_at is null or ub.expires_at > now());

alter view public.public_badges set (security_invoker = off);

comment on view public.public_badges is
  'Currently-valid badges, readable by any authenticated user. The single '
  'definition of "still verified": status = verified and expires_at in the '
  'future or null. security_invoker is off deliberately so this can be read '
  'without exposing user_badges, which holds licence numbers. Expect the '
  'Supabase advisor to flag it.';


-- -----------------------------------------------------------------------------
-- 6. user_badge_reviews -- admin-only audit trail
--
-- Separate from user_badges because it has a different audience. This table
-- records what the reviewer actually checked, and the user must not read it.
-- The user-facing message is user_badges.rejection_reason.
--
-- A row per decision rather than a column on the badge, so a renewal reviewed
-- three times has three records rather than one overwritten one. Same shape as
-- sponsored_listing_reviews in spec s4.2.
--
-- WHAT WAS CHECKED IS STRUCTURED, NOT PROSE
--
-- checked_identifier / checked_status / checked_expires_on / source_as_of are
-- columns rather than a sentence in notes, for two reasons:
--
--   1. A challenged badge needs an answer to "what did you see, and when?".
--      "looked fine" in a textarea is not that answer.
--   2. CSLB publishes a free Master List of California Licensed Contractors --
--      CSV/Excel, regenerated weekly, no registration -- carrying licence
--      number, status, issue and expiry dates and classifications. When that
--      import is built it writes these same four columns with
--      source = 'cslb_import', and the manual and automated history are one
--      series rather than two. That is the whole reason source exists now.
--
-- NO cslb_licenses TABLE IS CREATED HERE. Nothing imports yet, and a table with
-- no writer reports nothing -- the advertisement_metrics_daily lesson from spec
-- s4.6. The import is its own phase; this schema is only shaped to receive it.
--
-- source_as_of is the vintage of the record consulted, not the moment of
-- review. For a weekly CSV those differ by up to seven days, and "the file said
-- active as of the 14th" is a materially different claim from "it was active
-- when I looked".
-- -----------------------------------------------------------------------------

create table if not exists public.user_badge_reviews (
  id                 uuid        primary key default gen_random_uuid(),
  user_badge_id      uuid        not null references public.user_badges (id) on delete cascade,
  reviewer_id        uuid        references public.profiles (id) on delete set null,
  decision           text        not null,

  source             text        not null default 'manual',
  checked_identifier text,
  checked_status     text,
  checked_expires_on date,
  source_as_of       date,

  notes              text,
  reviewed_at        timestamptz not null default now(),

  constraint user_badge_reviews_decision_ck
    check (decision in ('approved', 'rejected', 'revoked')),

  constraint user_badge_reviews_source_ck
    check (source in ('manual', 'cslb_import')),

  -- An approval must say what was verified. This is the constraint that stops
  -- the table degrading into "approved by someone, at some point" -- which is
  -- what profiles.employer_verified already is, and the reason it cannot answer
  -- a challenge today.
  constraint user_badge_reviews_checked_identifier_ck
    check (
      decision <> 'approved'
      or coalesce(btrim(checked_identifier), '') <> ''
    )
);

comment on table public.user_badge_reviews is
  'Audit trail for badge decisions. Admin-only -- records what the reviewer '
  'checked and is never shown to the user. The user-facing message is '
  'user_badges.rejection_reason.';

comment on column public.user_badge_reviews.checked_identifier is
  'The licence or business number as it was actually verified, not as it was '
  'submitted. Required on an approval.';

comment on column public.user_badge_reviews.source_as_of is
  'Vintage of the record consulted. For the weekly CSLB Master List this is the '
  'file generation date, which can trail the review by up to a week.';

comment on column public.user_badge_reviews.source is
  'manual = an administrator looked it up. cslb_import = matched against an '
  'imported CSLB Master List. The import does not exist yet; this column is '
  'here so its rows join the same history rather than starting a second one.';

create index if not exists user_badge_reviews_badge_idx
  on public.user_badge_reviews (user_badge_id, reviewed_at desc);


-- -----------------------------------------------------------------------------
-- 7. Backfills, then the validation trigger
--
-- ORDER MATTERS. Both backfills run BEFORE user_badges_validate() exists,
-- because they award badges to existing accounts whose signup_type may be NULL
-- or may not match the badge's signup_types. Creating the trigger first would
-- make the migration fail on its own backfill.
-- -----------------------------------------------------------------------------

-- 7a. early_member: the first 100 accounts by created_at.
--
-- created_at is nullable on profiles (DEFAULT now(), no NOT NULL), so nulls
-- last, and id as a deterministic tiebreak -- without it, two rows sharing a
-- timestamp make the hundredth place arbitrary and the migration
-- non-reproducible between staging and production.
insert into public.user_badges (profile_id, badge_key, status, awarded_at)
select p.id, 'early_member', 'verified', coalesce(p.created_at, now())
from public.profiles p
order by p.created_at asc nulls last, p.id asc
limit 100
on conflict (profile_id, badge_key) do nothing;

-- 7b. business_verified, folded in from profiles.employer_verified.
--
-- awarded_at is now(), not created_at: employer_verified is a bare boolean with
-- no timestamp anywhere, so the original approval date does not exist. now() is
-- honest about being the date this was backfilled; created_at would be a
-- fabricated approval date.
--
-- THIS BACKFILL GOES STALE, and that is accepted rather than fixed here.
--
-- business_verified ships inactive, so no admin UI writes badges yet. The
-- existing panel (hooks/useEmployerVerifications.tsx) keeps writing
-- profiles.employer_verified directly, and the section 8 sync only runs
-- badge -> column. So every employer approved after this migration gets the
-- column and not the badge, and the two drift apart for as long as the badge is
-- off.
--
-- That is invisible while it lasts -- public_badges filters on badges.active,
-- so nothing renders either way. But it must be corrected at flip time, in the
-- same transaction as the UPDATE that switches the badge on:
--
--   insert into public.user_badges (profile_id, badge_key, status, awarded_at)
--   select p.id, 'business_verified', 'verified', now()
--   from public.profiles p
--   where p.employer_verified = true
--   on conflict (profile_id, badge_key) do nothing;
--
-- The alternative -- a reverse trigger on profiles keeping the badge in step
-- now -- was rejected: it would fire user_badges_validate() inside the existing
-- approve() call, and an employer whose signup_type is not c10 or brand would
-- fail eligibility and break a flow that works today.
insert into public.user_badges (profile_id, badge_key, status, awarded_at)
select p.id, 'business_verified', 'verified', now()
from public.profiles p
where p.employer_verified = true
on conflict (profile_id, badge_key) do nothing;


-- 7c. Validation: eligibility and the expiry rule.
create or replace function public.user_badges_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  badge_types  text[];
  needs_expiry boolean;
  is_active    boolean;
  holder_type  text;
begin
  select b.signup_types, b.requires_expiry, b.active
    into badge_types, needs_expiry, is_active
  from public.badges b
  where b.key = new.badge_key;

  -- An inactive badge cannot be REQUESTED. RLS lets any authenticated user
  -- insert a pending row for themselves, and it does not know which badges are
  -- on offer -- so without this, license_verified could be requested from the
  -- console while it is switched off and nothing is draining the queue.
  --
  -- Only 'pending' is blocked. Admin awards, the backfills in section 7 and any
  -- later re-sync still work on an inactive badge, which is what lets it be
  -- switched on with its history already correct.
  if tg_op = 'INSERT'
     and new.status = 'pending'
     and not coalesce(is_active, false) then
    raise exception
      'Badge % is not currently offered.', new.badge_key
      using errcode = '23514';
  end if;

  select p.signup_type into holder_type
  from public.profiles p
  where p.id = new.profile_id;

  -- Eligibility is checked only when the profile HAS a signup_type. Accounts
  -- predating the current signup form are NULL (see the backfill note in 1a),
  -- and locking them out of every badge would punish them for being early --
  -- which is the exact opposite of what early_member is for.
  if holder_type is not null
     and not (holder_type = any (badge_types)) then
    raise exception
      'Badge % is not offered to % accounts.', new.badge_key, holder_type
      using errcode = '23514';
  end if;

  if new.status = 'verified'
     and coalesce(needs_expiry, false)
     and new.expires_at is null then
    raise exception
      'Badge % requires an expiry date when it is verified.', new.badge_key
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.user_badges_validate() is
  'Enforces badges.signup_types eligibility and the badges.requires_expiry '
  'rule. Both are cross-table and so cannot be CHECK constraints. Skips the '
  'eligibility check when profiles.signup_type is NULL -- accounts predating '
  'the current signup form.';

drop trigger if exists user_badges_validate on public.user_badges;

create trigger user_badges_validate
  before insert or update on public.user_badges
  for each row execute function public.user_badges_validate();


-- -----------------------------------------------------------------------------
-- 8. The employer_verified parallel release
--
-- business_verified is now the source of truth. profiles.employer_verified is
-- kept in step by this trigger for ONE release, so that
-- components/ui/EmployerVerifiedBadge.tsx and its call sites keep working while
-- the app is cut over. The admin panel writes the badge; the old column follows.
--
-- TO FINISH THE CUTOVER, in a later migration:
--   drop trigger user_badges_sync_employer_verified on public.user_badges;
--   drop function public.sync_employer_verified();
--   alter table public.profiles drop column employer_verified;
--
-- Do that only once nothing reads employer_verified. At the time of writing,
-- hooks/useEmployerVerifications.tsx, components/ui/EmployerVerifiedBadge.tsx,
-- app/dashboard/profile/[id]/page.tsx, components/profile/ProfilePreviewModal.tsx
-- and components/marketplace/ProfileCard.tsx all do.
--
-- The sync is one-directional, badge -> column. Nothing writes the column back
-- to the badge, so once the admin panel is repointed there is a single writer.
-- -----------------------------------------------------------------------------

create or replace function public.sync_employer_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.badge_key <> 'business_verified' then
    return null;
  end if;

  update public.profiles p
     set employer_verified = (new.status = 'verified')
   where p.id = new.profile_id
     and p.employer_verified is distinct from (new.status = 'verified');

  return null;
end;
$$;

comment on function public.sync_employer_verified() is
  'Transitional: mirrors the business_verified badge onto the deprecated '
  'profiles.employer_verified column so existing UI keeps working for one '
  'release. One-directional. Drop this with the column -- see section 8 of '
  '20260916130000_badges.sql.';

drop trigger if exists user_badges_sync_employer_verified on public.user_badges;

create trigger user_badges_sync_employer_verified
  after insert or update on public.user_badges
  for each row execute function public.sync_employer_verified();


-- -----------------------------------------------------------------------------
-- 9. early_member for new signups
--
-- Awarded while fewer than 100 accounts hold it, rather than by counting
-- profiles. That rule is monotonic and self-limiting: it cannot be gamed by a
-- backdated created_at, it does not care that profiles.created_at is nullable,
-- and it stops for ever once the hundredth is issued.
--
-- Two simultaneous signups could both read 99 and both insert, giving 101. At
-- this volume that is not worth a lock, and the failure mode is one extra
-- badge rather than an unbounded count.
--
-- SECURITY DEFINER because user_badges INSERT is admin-only under RLS (section
-- 10) and this runs inside a signup. search_path pinned and every reference
-- qualified -- see the incident note in section 2.
-- -----------------------------------------------------------------------------

create or replace function public.award_early_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.user_badges where badge_key = 'early_member'
  ) < 100 then
    insert into public.user_badges (profile_id, badge_key, status, awarded_at)
    values (new.id, 'early_member', 'verified', now())
    on conflict (profile_id, badge_key) do nothing;
  end if;

  return null;
end;
$$;

comment on function public.award_early_member() is
  'Awards early_member to a new profile while fewer than 100 accounts hold it. '
  'Counts badges rather than profiles so the rule is monotonic and cannot be '
  'moved by a backdated created_at.';

drop trigger if exists profiles_award_early_member on public.profiles;

create trigger profiles_award_early_member
  after insert on public.profiles
  for each row execute function public.award_early_member();


-- -----------------------------------------------------------------------------
-- 10. RLS
--
-- user_badges is NOT readable by other users -- submitted_fields holds licence
-- numbers and rejection_reason is private to its owner. Everyone else reads
-- public_badges (section 5), which exposes neither.
--
-- There is deliberately NO user UPDATE policy on user_badges. A user who could
-- update their own row could set status = 'verified' on it; RLS gates rows, not
-- columns, and that is the is_admin lesson from spec s7.4. Editing a pending
-- request is therefore delete-and-resubmit, which the DELETE policy allows.
-- -----------------------------------------------------------------------------

alter table public.badges            enable row level security;
alter table public.user_badges       enable row level security;
alter table public.user_badge_reviews enable row level security;

drop policy if exists "badges are readable by authenticated users" on public.badges;
create policy "badges are readable by authenticated users"
  on public.badges for select
  to authenticated
  using (true);

drop policy if exists "users read their own badges" on public.user_badges;
create policy "users read their own badges"
  on public.user_badges for select
  to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());

-- A request, and only a request. Every field an approval would set is pinned to
-- its unawarded value here, so this policy cannot be used to self-grant.
drop policy if exists "users request their own badges" on public.user_badges;
create policy "users request their own badges"
  on public.user_badges for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and status = 'pending'
    and awarded_at is null
    and expires_at is null
    and reviewed_by is null
    and reviewed_at is null
    and rejection_reason is null
  );

-- Withdraw a pending request, or clear a rejected one to reapply. Not a
-- verified or revoked badge: deleting those would let a user erase a revocation
-- and request the badge again from clean.
drop policy if exists "users withdraw their own requests" on public.user_badges;
create policy "users withdraw their own requests"
  on public.user_badges for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    and status in ('pending', 'rejected')
  );

drop policy if exists "admins update badges" on public.user_badges;
create policy "admins update badges"
  on public.user_badges for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins insert badges" on public.user_badges;
create policy "admins insert badges"
  on public.user_badges for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete badges" on public.user_badges;
create policy "admins delete badges"
  on public.user_badges for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "admins read badge reviews" on public.user_badge_reviews;
create policy "admins read badge reviews"
  on public.user_badge_reviews for select
  to authenticated
  using (public.is_admin());

-- reviewer_id is pinned to the caller so a review cannot be filed under someone
-- else's name. Same reasoning as taking the user id from the session rather
-- than the request body in lib/apiAuth.tsx.
drop policy if exists "admins file badge reviews" on public.user_badge_reviews;
create policy "admins file badge reviews"
  on public.user_badge_reviews for insert
  to authenticated
  with check (public.is_admin() and reviewer_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 11. Grants
--
-- badges and user_badges: no column-level grant games. The RLS above does the
-- work, and the one column that must never be user-written -- status -- is
-- protected by the insert policy pinning it to 'pending' rather than by a
-- grant. Contrast role_credentials.verified in 20260909120000, where a grant
-- was the right tool because there was no per-row rule to express.
-- -----------------------------------------------------------------------------

revoke all on public.badges             from anon;
revoke all on public.user_badges        from anon;
revoke all on public.user_badge_reviews from anon;
revoke all on public.public_badges      from anon;

grant select on public.badges        to authenticated;
grant select on public.public_badges to authenticated;

grant select, insert, delete on public.user_badges to authenticated;
grant update on public.user_badges to authenticated;

grant select, insert on public.user_badge_reviews to authenticated;
