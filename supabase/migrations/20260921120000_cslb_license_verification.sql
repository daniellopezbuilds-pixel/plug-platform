-- =============================================================================
-- CSLB C-10 licence verification
--
-- STATUS: not yet applied. Push to STAGING first, load an import, test, then
-- push 20260921130000 (which switches the badge on). Production repeats the
-- same three steps in the same order.
--
-- THIS MIGRATION IS INERT ON ITS OWN, and deliberately so. Every write path
-- below early-outs while badges.license_verified is inactive, which it is until
-- 20260921130000 runs. So this can sit on a database with no imported data
-- without changing the behaviour of a single signup.
--
-- That is not tidiness. user_badges_validate() raises 23514 when a 'pending'
-- row is inserted for an inactive badge, and the verification trigger added
-- here fires inside the signup transaction. Without the early-out, pushing this
-- file before the badge was switched on would break every C-10 signup.
--
--
-- WHAT THIS ADDS
--   cslb_licenses           the imported CSLB Master List, C-10 rows only
--   cslb_licenses_staging   load target; the live table is replaced from it
--   cslb_imports            ledger -- file date, row count, when
--   cslb_normalise_license  one definition of "the same licence number"
--   cslb_data_age_days      the staleness guard
--   cslb_evaluate_license   THE DECISION TABLE, in one place
--   cslb_apply_check        writes the badge and the audit row
--   cslb_verify_from_credentials   the trigger on role_credentials
--   cslb_reset_staging      empties the load target before a run
--   cslb_commit_import      atomic replace, with the row-count guard
--   cslb_recheck_all        post-import sweep
--   user_badge_reviews.reason, and a 'needs_review' decision
--
--
-- WHY A TRIGGER ON role_credentials AND NOT AN API ROUTE
--
-- Three reasons, and the third settles it:
--
--   1. Email signup never reaches a server route. handle_new_user() writes
--      profiles, account_roles and role_credentials inside the auth.users
--      insert. There is no server-side moment to hook.
--   2. The Google path (app/api/onboarding/complete/route.tsx) upserts the same
--      table with service_role, so it is covered by the same trigger for free.
--   3. app/dashboard/profile/page.tsx writes role_credentials.fields STRAIGHT
--      FROM THE BROWSER, under the `grant update (fields)` from 20260909120000.
--      A route would only bind callers that choose to use it. This is the exact
--      argument 20260917120000 made when it put the verification RESET in a
--      trigger rather than a route, and it applies just as much to the re-check
--      that has to follow that reset.
--
-- Running inside Postgres is strictly stronger than holding the service role:
-- there is no key to leak, and no caller that can decline to call it.
--
--
-- THE TRIGGER MUST NEVER BE ABLE TO FAIL A SIGNUP. Its body is wrapped in an
-- exception handler that warns and returns. A licence lookup is not a reason an
-- account cannot be created, and the 2026-09-10 incident -- a hardening change
-- to handle_new_user() taking down every signup -- is the precedent this is
-- written against. See supabase/README.md.
--
--
-- HOUSE STYLE: every function here is SECURITY DEFINER with `set search_path =
-- ''` and every reference schema-qualified, matching the guards in
-- 20260917120000. See the same incident note for why that matters.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. cslb_licenses -- the imported file
--
-- ONLY C-10 ROWS LAND HERE. The published file carries 244,519 licences across
-- every classification; the import script filters to the 29,123 holding C10
-- before inserting. Filtering in the script rather than here keeps the table
-- the size of the question it answers.
--
-- license_no is the primary key, not a surrogate id. Verified against the real
-- 2026-09-19 file: all 244,519 LicenseNo values are numeric and every one is
-- distinct.
--
-- class_keys is the PARSED classification list -- 'A| B| C10| C36' becomes
-- {A,B,C10,C36}. Stored even though every row here holds C10 by construction,
-- so cslb_evaluate_license() can check the rule rather than assume it. If the
-- import filter ever widens, the rule stays correct and no function changes.
--
-- No index beyond the primary key. Every read is a lookup by licence number.
-- -----------------------------------------------------------------------------

create table if not exists public.cslb_licenses (
  license_no         text primary key,
  business_name      text,
  full_business_name text,
  city               text,
  county             text,
  state              text,
  expiration_date    date,
  primary_status     text,
  secondary_status   text,
  classifications    text,
  class_keys         text[] not null default '{}',
  last_update        date,
  source_as_of       date   not null
);

comment on table public.cslb_licenses is
  'CSLB Master List of California Licensed Contractors, filtered to licences '
  'holding a C10 classification. Replaced wholesale by cslb_commit_import(). '
  'Not readable from the browser -- the only readers are the SECURITY DEFINER '
  'functions in this file.';

comment on column public.cslb_licenses.license_no is
  'Digits only, normalised by cslb_normalise_license(). The published file '
  'writes these as plain integers; users type them with prefixes and dashes.';

comment on column public.cslb_licenses.class_keys is
  'Classifications(s) parsed: split on |, trimmed, hyphens stripped, upper '
  'cased. The published strings are inconsistent -- "C10", "C-6" and '
  '"A| B| C10| C36" all occur. Matching is exact against this array, never a '
  'substring, so C100 can never satisfy a C10 check.';

comment on column public.cslb_licenses.source_as_of is
  'The file generation date, passed to the import and stamped on every row by '
  'cslb_commit_import(). NOT the date of the import -- a fresh import of a '
  'six-week-old file is six-week-old data, and the staleness guard measures '
  'this column.';


-- Load target. The script fills this, then cslb_commit_import() moves it across
-- in one transaction. Unlogged: its contents are disposable, and the only thing
-- that ever reads it is the commit function moments later.
create unlogged table if not exists public.cslb_licenses_staging (
  license_no         text primary key,
  business_name      text,
  full_business_name text,
  city               text,
  county             text,
  state              text,
  expiration_date    date,
  primary_status     text,
  secondary_status   text,
  classifications    text,
  class_keys         text[] not null default '{}',
  last_update        date
);

comment on table public.cslb_licenses_staging is
  'Load target for scripts/import-cslb.mjs. Has no source_as_of column on '
  'purpose: cslb_commit_import() stamps the file date onto the live rows and '
  'onto the ledger row from one argument, so the two can never disagree.';


-- -----------------------------------------------------------------------------
-- 2. cslb_imports -- the ledger
--
-- SURVIVES THE WHOLESALE REPLACE, which is the entire point of it being a
-- separate table. Two guards need history that cslb_licenses cannot hold,
-- because cslb_licenses gets truncated on every import:
--
--   - the row-count guard, which compares this import against the last one
--   - the staleness guard, which needs to know when data last arrived
-- -----------------------------------------------------------------------------

create table if not exists public.cslb_imports (
  id           uuid        primary key default gen_random_uuid(),
  source_as_of date        not null,
  row_count    integer     not null,
  file_name    text,
  imported_at  timestamptz not null default now(),
  notes        text
);

create index if not exists cslb_imports_imported_at_idx
  on public.cslb_imports (imported_at desc);

comment on table public.cslb_imports is
  'One row per successful import. Never truncated -- the row-count guard and '
  'the staleness guard both read it.';


-- -----------------------------------------------------------------------------
-- 3. user_badge_reviews gains 'needs_review' and a structured reason
--
-- 20260916130000 shaped this table to receive exactly this import. source,
-- checked_identifier, checked_status, checked_expires_on and source_as_of are
-- already here, and that migration's comment says the automated rows should
-- join the same history rather than starting a second one.
--
-- WHY 'needs_review' IS A DECISION VALUE. The automated check makes no
-- decision -- that is the point of "never auto-reject on a miss". But it did
-- run, it did look at something, and what it saw is the reason a human is now
-- being asked. Without a row, the admin queue has an entry with no explanation
-- and the next import cannot tell whether anything changed. reviewer_id is
-- already nullable, so an unattended check needs no other column.
--
-- WHY reason IS A COLUMN AND NOT PROSE IN notes. The panel renders a label from
-- it, and cslb_apply_check() compares it against the previous check to decide
-- whether anything actually changed. A sentence in a textarea can do neither.
-- -----------------------------------------------------------------------------

alter table public.user_badge_reviews
  drop constraint if exists user_badge_reviews_decision_ck;

alter table public.user_badge_reviews
  add constraint user_badge_reviews_decision_ck
    check (decision in ('approved', 'rejected', 'revoked', 'needs_review'));

alter table public.user_badge_reviews
  add column if not exists reason text;

alter table public.user_badge_reviews
  drop constraint if exists user_badge_reviews_reason_ck;

alter table public.user_badge_reviews
  add constraint user_badge_reviews_reason_ck
    check (
      reason is null
      or reason in (
        'no_number',
        'not_found',
        'suspended',
        'pending_suspension',
        'wrong_classification',
        'expired',
        'stale_data'
      )
    );

comment on column public.user_badge_reviews.reason is
  'Why an automated check did not verify. NULL on a human decision and on an '
  'automated approval. Constrained rather than free text because the admin '
  'panel renders a label from it and cslb_apply_check() compares it against '
  'the previous check to detect a change.';

comment on column public.user_badge_reviews.decision is
  'approved | rejected | revoked are human decisions -- approved is also what '
  'an automated match writes. needs_review is not a decision: it records that '
  'the automated check ran, what it saw, and why it declined to verify.';


-- -----------------------------------------------------------------------------
-- 4. cslb_normalise_license -- one definition of "the same licence number"
--
-- The published file writes licence numbers as plain integers. People type
-- them as "C10-1234567", "#1234567", "1 234 567". Digits only is the
-- normalisation, and it is safe here because CSLB licence numbers are purely
-- numeric -- verified across all 244,519 rows of the 2026-09-19 file, zero
-- exceptions.
--
-- IMMUTABLE and no table access, so it needs no SECURITY DEFINER. It is the one
-- function in this file that is pure.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_normalise_license(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '');
$$;

comment on function public.cslb_normalise_license(text) is
  'Licence number reduced to digits. NULL for anything with no digits at all. '
  'Applied to both sides of every comparison -- the imported rows and the '
  'user-typed value -- so "C10-1234567" and "1234567" are one licence.';


-- -----------------------------------------------------------------------------
-- 5. cslb_data_age_days -- the staleness guard
--
-- Measured on source_as_of, the FILE date, not imported_at. A fresh import of a
-- six-week-old file is six-week-old data, and the thing being guarded against
-- is verifying somebody against a record that has since changed.
--
-- NULL means nothing has ever been imported. Callers treat that as stale --
-- see cslb_evaluate_license() -- because verifying against an empty table
-- would make every licence "not found" and send the whole queue to review
-- under the wrong reason.
--
-- EXECUTE is granted to authenticated: it returns one integer, derived from
-- data that is published by the state, and the admin panel needs it for the
-- staleness banner. Nothing else in this file is reachable from the browser.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_data_age_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (current_date - max(i.source_as_of))::integer
  from public.cslb_imports i;
$$;

comment on function public.cslb_data_age_days() is
  'Days since the newest imported file was generated. NULL when nothing has '
  'been imported. Measured on source_as_of rather than imported_at: a fresh '
  'import of an old file is old data.';


-- -----------------------------------------------------------------------------
-- 6. cslb_evaluate_license -- THE DECISION TABLE
--
-- One place. The trigger, the post-import sweep and any future caller all get
-- the same answer, and changing the rule means changing this function and
-- nothing else.
--
-- Evaluated in order; first match wins. A NULL reason means verify.
--
--   1. no digits in what the user typed   -> no_number
--   2. data older than 30 days, or none   -> stale_data
--   3. number not in cslb_licenses        -> not_found
--   4. primary_status <> 'CLEAR'          -> suspended
--   5. secondary_status mentions susp     -> pending_suspension
--   6. C10 not in class_keys              -> wrong_classification
--   7. expiration_date before today       -> expired
--   8. otherwise                          -> verify
--
-- NEVER auto-reject. Every one of the seven outcomes above is a request for a
-- human, not a refusal. not_found in particular is ambiguous by construction:
-- the published file lists active licences only, so a miss is a typo, a
-- brand-new licence, or one that has been revoked -- and those want opposite
-- answers.
--
-- WHY 4 AND 5 ARE SEPARATE, against the shape of the original brief. The brief
-- put suspension in SecondaryStatus. In the real file it is in PrimaryStatus:
-- all nineteen non-CLEAR primary values are suspensions (Contr Bond Susp 1038,
-- Work Comp Susp 263, Liab Ins Susp 54, and fifteen more). SecondaryStatus
-- carries PENDING items -- 'WC Susp Pending' on 304 otherwise-clear C-10s,
-- 'Entity Susp PND' on 11. So rule 4 catches every actual suspension and rule 5
-- catches a suspension that has not happened yet. Both go to review, because
-- this is a compliance product, but they are recorded as different reasons so
-- the reviewer can tell them apart.
--
-- '7073E Probation' and the other SecondaryStatus values are deliberately NOT
-- matched. Probation is not suspension, and widening the pattern to "anything
-- unusual" would put a further 150-odd clear licences in front of a human for
-- no stated rule.
--
-- WHY expiration_date < current_date AND NOT <=. A CSLB licence is valid
-- THROUGH its expiration date. A licence expiring today is valid today. The
-- same day boundary is applied at the other end in cslb_apply_check(), which
-- sets the badge's expires_at to the day AFTER the printed date.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_evaluate_license(p_license text)
returns table (
  reason             text,
  checked_identifier text,
  checked_status     text,
  checked_expires_on date,
  source_as_of       date,
  business_name      text,
  city               text,
  county             text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lic      text;
  age_days integer;
  rec      public.cslb_licenses%rowtype;
  vintage  date;
begin
  lic := public.cslb_normalise_license(p_license);

  select max(i.source_as_of) into vintage from public.cslb_imports i;
  age_days := current_date - vintage;

  -- 1. Nothing to look up.
  if lic is null then
    return query select
      'no_number'::text, null::text, null::text, null::date,
      vintage, null::text, null::text, null::text;
    return;
  end if;

  -- 2. Stale, or never imported. Checked BEFORE the lookup on purpose: against
  --    an empty or outdated table the lookup's answer is not trustworthy, and
  --    reporting 'not_found' for it would be a claim about a licence rather
  --    than about our data.
  if vintage is null or age_days > 30 then
    return query select
      'stale_data'::text, lic, null::text, null::date,
      vintage, null::text, null::text, null::text;
    return;
  end if;

  select * into rec from public.cslb_licenses l where l.license_no = lic;

  -- 3. Not in the file. Ambiguous, never a rejection -- see the header.
  if not found then
    return query select
      'not_found'::text, lic, null::text, null::date,
      vintage, null::text, null::text, null::text;
    return;
  end if;

  return query select
    case
      -- 4. Any non-CLEAR primary status is a suspension.
      when rec.primary_status is distinct from 'CLEAR' then 'suspended'
      -- 5. A suspension that has not landed yet.
      when coalesce(rec.secondary_status, '') ~* 'susp' then 'pending_suspension'
      -- 6. Exact membership, never a substring.
      when not ('C10' = any (rec.class_keys)) then 'wrong_classification'
      -- 7. Valid THROUGH the printed date.
      when rec.expiration_date is null
        or rec.expiration_date < current_date then 'expired'
      else null
    end::text,
    lic,
    rec.primary_status,
    rec.expiration_date,
    rec.source_as_of,
    coalesce(nullif(btrim(rec.business_name), ''), rec.full_business_name),
    rec.city,
    rec.county;
end;
$$;

comment on function public.cslb_evaluate_license(text) is
  'The C-10 verification decision table, in one place. Returns a NULL reason '
  'when the licence verifies and one of no_number, stale_data, not_found, '
  'suspended, pending_suspension, wrong_classification or expired otherwise. '
  'Never rejects -- every non-NULL reason means "ask a human".';


-- -----------------------------------------------------------------------------
-- 7. cslb_apply_check -- write the badge and the audit row
--
-- Called by the trigger (one profile, after a credential write) and by
-- cslb_recheck_all() (every contractor, after an import). Returns a short
-- outcome code so the sweep can report what it did.
--
-- HUMAN DECISIONS ARE NOT OVERRIDDEN.
--
--   revoked  -- never touched, on either path. An administrator took this badge
--               away; an administrator gives it back. An import finding the
--               licence CLEAR again is not new information about why it was
--               revoked, which is usually something the file does not carry.
--   rejected -- not touched by the post-import sweep, because the human was
--               ruling on the value that is still there. It IS re-checked when
--               the credential itself changes, because then the thing they
--               ruled on is gone. That is the p_after_edit argument.
--
-- AND A VERIFIED BADGE IS NEVER KNOCKED BACK BY AN ABSENCE OF EVIDENCE.
-- Four of the seven reasons say something bad was found -- suspended,
-- pending_suspension, wrong_classification, expired -- and those are exactly
-- what the post-import sweep is for. Two say nothing was found:
--
--   stale_data -- our file is too old to judge with. The brief is explicit:
--                 staleness stops NEW automatic verifications and leaves
--                 existing badges alone. So a verified badge survives it.
--   not_found  -- and the badge was approved by a HUMAN. They had evidence the
--                 file does not carry (a licence newer than the file, a lookup
--                 done by hand). Re-running the sweep would knock it back every
--                 week for ever, and the queue would fill with the same entry.
--                 A badge verified by the IMPORT and now missing is a different
--                 matter and does go back to review -- that is a licence that
--                 has disappeared from the active list.
--
-- IT WRITES NOTHING WHEN NOTHING CHANGED. A weekly sweep over a stable set of
-- contractors would otherwise add one audit row per contractor per week,
-- burying the rows that record an actual event. "Changed" means the status, the
-- expiry, or the reason differs from the last recorded check.
--
-- expires_at IS THE DAY AFTER THE PRINTED DATE. A licence is valid through its
-- expiration date, and public_badges tests `expires_at > now()`. Setting it to
-- midnight on the printed date would drop the check mark a day early, on every
-- badge. checked_expires_on on the audit row keeps the printed date itself.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_apply_check(
  p_profile_id  uuid,
  p_license     text,
  p_after_edit  boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev            record;
  badge         public.user_badges%rowtype;
  has_badge     boolean;
  -- Three scalars rather than a record: a record variable that never had a row
  -- assigned raises on field access, and both branches below read these when
  -- there may have been no review row to read.
  last_decision text;
  last_source   text;
  last_reason   text;
  want_status   text;
  want_expiry   timestamptz;
  badge_id      uuid;
  note          text;
begin
  select * into badge
  from public.user_badges ub
  where ub.profile_id = p_profile_id
    and ub.badge_key = 'license_verified';

  -- Captured immediately. `found` is reset by every subsequent query, and the
  -- next one is two lines away.
  has_badge := found;

  if has_badge then
    if badge.status = 'revoked' then
      return 'skipped:revoked';
    end if;

    if badge.status = 'rejected' and not p_after_edit then
      return 'skipped:rejected';
    end if;

    select r.decision, r.source, r.reason
      into last_decision, last_source, last_reason
    from public.user_badge_reviews r
    where r.user_badge_id = badge.id
    order by r.reviewed_at desc
    limit 1;
  end if;

  select * into ev from public.cslb_evaluate_license(p_license);

  -- The two absence-of-evidence cases. See the header.
  if has_badge and badge.status = 'verified' then
    if ev.reason = 'stale_data' then
      return 'skipped:stale';
    end if;

    if ev.reason = 'not_found'
       and last_source = 'manual'
       and last_decision = 'approved' then
      return 'skipped:manual';
    end if;
  end if;

  want_status := case when ev.reason is null then 'verified' else 'pending' end;
  want_expiry := case
    when ev.reason is null and ev.checked_expires_on is not null
      then (ev.checked_expires_on + 1)::timestamptz
    else null
  end;

  if has_badge
     and badge.status = want_status
     and badge.expires_at is not distinct from want_expiry
     and last_reason is not distinct from ev.reason then
    return 'unchanged';
  end if;

  -- submitted_fields carries the licence number so the admin queue can show it
  -- without reading role_credentials. user_badges is readable by its owner and
  -- by admins and by nobody else, which is the same audience the credential
  -- row has.
  insert into public.user_badges (
    profile_id, badge_key, status, submitted_fields,
    awarded_at, expires_at, rejection_reason, reviewed_by, reviewed_at
  )
  values (
    p_profile_id,
    'license_verified',
    want_status,
    jsonb_build_object('license_number', coalesce(ev.checked_identifier, '')),
    case when want_status = 'verified' then now() else null end,
    want_expiry,
    null,
    null,
    now()
  )
  on conflict (profile_id, badge_key) do update set
    status           = excluded.status,
    submitted_fields = excluded.submitted_fields,
    -- A badge that was already verified keeps its original award date; one
    -- being verified now gets today's. A badge going back to review loses it,
    -- because user_badges_awarded_at_ck only requires it on 'verified' and
    -- keeping it would claim an award that is no longer held.
    -- `user_badges.` here is the EXISTING row, which is how ON CONFLICT DO
    -- UPDATE refers to it -- unqualified by schema, always by the table name.
    awarded_at       = case
                         when excluded.status = 'verified'
                           then coalesce(user_badges.awarded_at, now())
                         else null
                       end,
    expires_at       = excluded.expires_at,
    -- Cleared: the row is no longer 'rejected', and the constraint forbids a
    -- reason on any other status only in the sense that it would be a lie.
    rejection_reason = null,
    reviewed_by      = null,
    reviewed_at      = now()
  returning id into badge_id;

  if ev.business_name is not null then
    note := 'CSLB record: ' || ev.business_name
         || coalesce(', ' || nullif(btrim(ev.city), ''), '')
         || coalesce(' (' || nullif(btrim(ev.county), '') || ' County)', '');
  end if;

  insert into public.user_badge_reviews (
    user_badge_id, reviewer_id, decision, source,
    checked_identifier, checked_status, checked_expires_on, source_as_of,
    reason, notes
  )
  values (
    badge_id,
    null,
    case when ev.reason is null then 'approved' else 'needs_review' end,
    'cslb_import',
    ev.checked_identifier,
    ev.checked_status,
    ev.checked_expires_on,
    ev.source_as_of,
    ev.reason,
    note
  );

  return case
    when ev.reason is null then 'verified'
    else 'review:' || ev.reason
  end;
end;
$$;

comment on function public.cslb_apply_check(uuid, text, boolean) is
  'Runs cslb_evaluate_license() for one profile and writes the badge plus an '
  'audit row. Never touches a revoked badge, and leaves a rejected one alone '
  'unless the credential itself just changed (p_after_edit). Writes nothing '
  'when the status, the expiry and the reason all match the last check.';


-- -----------------------------------------------------------------------------
-- 8. The trigger on role_credentials
--
-- Fires on INSERT (signup, both paths) and on UPDATE OF fields (the profile
-- editor). On an update it runs immediately after
-- role_credentials_reset_verification, the BEFORE trigger from 20260917120000
-- that clears the verified flag when fields change -- so "editing a licence
-- clears verification, then it is re-checked" is two triggers on one statement
-- rather than a convention some caller has to remember.
--
-- FOUR EARLY-OUTS, in cheapest-first order. The badge-active one is load
-- bearing, not tidiness: see the header.
--
-- THE EXCEPTION HANDLER IS THE POINT OF THE REST OF THIS COMMENT. This function
-- runs inside the auth.users insert. Anything it raises fails a signup. There
-- is no licence-check outcome worth that, so everything is caught, warned and
-- swallowed -- the account is created, and the badge is picked up by the next
-- post-import sweep.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_verify_from_credentials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  badge_live  boolean;
  holder_type text;
begin
  if new.role_key is distinct from 'contractor' then
    return null;
  end if;

  select b.active into badge_live
  from public.badges b
  where b.key = 'license_verified';

  if not coalesce(badge_live, false) then
    return null;
  end if;

  select p.signup_type into holder_type
  from public.profiles p
  where p.id = new.profile_id;

  if holder_type is distinct from 'c10' then
    return null;
  end if;

  perform public.cslb_apply_check(
    new.profile_id,
    new.fields ->> 'license_number',
    true
  );

  return null;
exception
  when others then
    raise warning 'cslb: licence check skipped for profile % -- %',
      new.profile_id, sqlerrm;
    return null;
end;
$$;

comment on function public.cslb_verify_from_credentials() is
  'Re-checks a C-10 licence against the imported CSLB data whenever the '
  'credential is written. Silently does nothing while the license_verified '
  'badge is inactive, and swallows every error -- this runs inside the signup '
  'transaction and must never be able to fail an account creation.';

drop trigger if exists role_credentials_cslb_verify on public.role_credentials;

create trigger role_credentials_cslb_verify
  after insert or update of fields on public.role_credentials
  for each row execute function public.cslb_verify_from_credentials();


-- -----------------------------------------------------------------------------
-- 9. cslb_commit_import -- the atomic replace, and the row-count guard
--
-- WHY THIS IS A FUNCTION AND NOT A SEQUENCE OF CALLS FROM THE SCRIPT.
-- supabase-js talks to PostgREST, which gives every statement its own
-- transaction. A script that truncated and then inserted would leave the table
-- empty for the duration of the load and half-loaded for ever if it died
-- half-way. A function body is one transaction, so either the whole replacement
-- lands or none of it does.
--
-- THE ROW-COUNT GUARD. A truncated download must not be able to wipe
-- verification. The new row count is compared against the previous import's and
-- the commit is refused if it has dropped below p_min_ratio of it. 0.9 by
-- default: the C-10 slice is ~29,000 and a genuine week-over-week move is well
-- under one per cent, so this is loose enough never to fire on real data and
-- tight enough to catch a file that stopped downloading.
--
-- p_force exists for the case where the drop is real -- CSLB changing what it
-- publishes -- and it has to be passed deliberately, from a flag the operator
-- typed.
--
-- The staging table is emptied on success so the next run starts clean and a
-- failed load never contributes rows to the run after it.
-- -----------------------------------------------------------------------------

-- Called by the script before it starts loading. A run that died after
-- inserting would otherwise contribute its rows to the next one, and the
-- row-count guard would be comparing a mixture of two files against the last
-- good import.
--
-- A function rather than a DELETE from the script because PostgREST requires a
-- filter on every delete, and "delete everything" expressed as a filter that
-- happens to match everything is a worse thing to have in a script than a named
-- call that says what it does.
create or replace function public.cslb_reset_staging()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.cslb_licenses_staging;
end;
$$;

comment on function public.cslb_reset_staging() is
  'Empties the import staging table. Called by scripts/import-cslb.mjs before '
  'a load, so a previous run that died part way cannot contribute rows to the '
  'next one.';


create or replace function public.cslb_commit_import(
  p_source_as_of date,
  p_file_name    text    default null,
  p_min_ratio    numeric default 0.9,
  p_force        boolean default false
)
returns table (
  imported_rows integer,
  previous_rows integer,
  file_date     date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  staged integer;
  prev   integer;
begin
  select count(*)::integer into staged from public.cslb_licenses_staging;

  if staged = 0 and not p_force then
    raise exception
      'cslb import refused: staging table is empty. Pass force to override.'
      using errcode = '23514';
  end if;

  select i.row_count into prev
  from public.cslb_imports i
  order by i.imported_at desc
  limit 1;

  if prev is not null
     and not p_force
     and staged < floor(prev * p_min_ratio) then
    raise exception
      'cslb import refused: % rows is below % percent of the previous import '
      '(%). A truncated download must not wipe verification. Pass force if '
      'the drop is real.',
      staged, round(p_min_ratio * 100), prev
      using errcode = '23514';
  end if;

  truncate table public.cslb_licenses;

  insert into public.cslb_licenses (
    license_no, business_name, full_business_name, city, county, state,
    expiration_date, primary_status, secondary_status, classifications,
    class_keys, last_update, source_as_of
  )
  select
    s.license_no, s.business_name, s.full_business_name, s.city, s.county,
    s.state, s.expiration_date, s.primary_status, s.secondary_status,
    s.classifications, s.class_keys, s.last_update, p_source_as_of
  from public.cslb_licenses_staging s;

  insert into public.cslb_imports (source_as_of, row_count, file_name)
  values (p_source_as_of, staged, p_file_name);

  truncate table public.cslb_licenses_staging;

  return query select staged, prev, p_source_as_of;
end;
$$;

comment on function public.cslb_commit_import(date, text, numeric, boolean) is
  'Replaces cslb_licenses from cslb_licenses_staging in one transaction, '
  'stamps the file date on every row, and records the import in cslb_imports. '
  'Refuses when the row count has dropped below p_min_ratio of the previous '
  'import, so a truncated download cannot wipe verification.';


-- -----------------------------------------------------------------------------
-- 10. cslb_recheck_all -- the post-import sweep
--
-- ITERATES OVER CONTRACTORS, NOT OVER EXISTING BADGES, which is broader than
-- the brief asked for and strictly better. Walking the badges would re-check
-- everyone who already has one and never notice a C-10 who has been waiting
-- since before the first import. Walking role_credentials does both: an
-- existing badge is re-evaluated, and a contractor without one is picked up.
--
-- Revoked and rejected badges are skipped inside cslb_apply_check (p_after_edit
-- is false here -- nothing about the credential changed, so a human's ruling on
-- it still stands).
--
-- Returns a tally rather than a row per profile: the script prints it, and a
-- 29,000-row result set for an operator to read past is not a report.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_recheck_all()
returns table (outcome text, accounts integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec        record;
  result     text;
  badge_live boolean;
  tally      jsonb := '{}'::jsonb;
begin
  -- Same early-out as the trigger, and for the same reason: while the badge is
  -- inactive, user_badges_validate() refuses every 'pending' insert, so a sweep
  -- would raise once per contractor and report nothing but errors. Running the
  -- import before 20260921130000 is a normal thing to do -- that is the order
  -- this was designed for -- so it answers rather than fails.
  select b.active into badge_live
  from public.badges b
  where b.key = 'license_verified';

  if not coalesce(badge_live, false) then
    return query select 'skipped:badge_inactive'::text, 0;
    return;
  end if;

  for rec in
    select rc.profile_id, rc.fields ->> 'license_number' as license
    from public.role_credentials rc
    join public.profiles p on p.id = rc.profile_id
    where rc.role_key = 'contractor'
      and p.signup_type = 'c10'
  loop
    begin
      result := public.cslb_apply_check(rec.profile_id, rec.license, false);
    exception
      when others then
        -- One unhappy profile must not abandon the sweep half-way. The next
        -- import picks it up again.
        raise warning 'cslb: recheck failed for profile % -- %',
          rec.profile_id, sqlerrm;
        result := 'error';
    end;

    tally := jsonb_set(
      tally,
      array[result],
      to_jsonb(coalesce((tally ->> result)::integer, 0) + 1)
    );
  end loop;

  return query
    select t.key, t.value::integer
    from jsonb_each_text(tally) t
    order by t.key;
end;
$$;

comment on function public.cslb_recheck_all() is
  'Re-evaluates every C-10 contractor against the current import and returns a '
  'tally by outcome. Walks role_credentials rather than existing badges, so a '
  'contractor who has never been checked is picked up as well as one whose '
  'licence has since been suspended.';


-- -----------------------------------------------------------------------------
-- 11. RLS and grants
--
-- cslb_licenses IS NOT READABLE FROM THE BROWSER. It is public data, but it is
-- 29,000 rows of contractor records and nothing in the app needs to page
-- through them -- the only readers are the SECURITY DEFINER functions above,
-- which run as the owner and are not subject to these policies. RLS is enabled
-- with no policies at all, which denies everyone the grants do not already
-- exclude.
--
-- cslb_imports gets an admin SELECT policy so the panel can show the file date
-- and row count beside the staleness warning.
-- -----------------------------------------------------------------------------

alter table public.cslb_licenses         enable row level security;
alter table public.cslb_licenses_staging enable row level security;
alter table public.cslb_imports          enable row level security;

drop policy if exists "admins read cslb imports" on public.cslb_imports;
create policy "admins read cslb imports"
  on public.cslb_imports for select
  to authenticated
  using (public.is_admin());

revoke all on public.cslb_licenses         from anon, authenticated;
revoke all on public.cslb_licenses_staging from anon, authenticated;
revoke all on public.cslb_imports          from anon, authenticated;

grant select on public.cslb_imports to authenticated;

grant all on public.cslb_licenses         to service_role;
grant all on public.cslb_licenses_staging to service_role;
grant all on public.cslb_imports          to service_role;

-- The decision table and the writers are internal. They are reachable only from
-- the trigger, from the sweep, and from the import script's service_role
-- connection -- never as an RPC from a browser holding the anon key.
revoke all on function public.cslb_evaluate_license(text)              from anon, authenticated;
revoke all on function public.cslb_apply_check(uuid, text, boolean)    from anon, authenticated;
revoke all on function public.cslb_reset_staging()                     from anon, authenticated;
revoke all on function public.cslb_commit_import(date, text, numeric, boolean) from anon, authenticated;
revoke all on function public.cslb_recheck_all()                       from anon, authenticated;

grant execute on function public.cslb_evaluate_license(text)              to service_role;
grant execute on function public.cslb_apply_check(uuid, text, boolean)    to service_role;
grant execute on function public.cslb_reset_staging()                     to service_role;
grant execute on function public.cslb_commit_import(date, text, numeric, boolean) to service_role;
grant execute on function public.cslb_recheck_all()                       to service_role;

-- The two that the app itself calls. cslb_data_age_days returns one integer
-- and drives the admin staleness banner; cslb_normalise_license is pure and is
-- used nowhere server-side that matters, but the panel benefits from agreeing
-- with the database about what a licence number is.
grant execute on function public.cslb_data_age_days()          to authenticated, service_role;
grant execute on function public.cslb_normalise_license(text)  to authenticated, service_role;
