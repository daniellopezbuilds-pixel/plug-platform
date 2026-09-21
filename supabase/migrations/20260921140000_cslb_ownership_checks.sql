-- =============================================================================
-- CSLB verification: does this licence belong to this account?
--
-- STATUS: not yet applied. Staging first, test, then production.
--
-- A SEPARATE FILE RATHER THAN AN EDIT TO 20260921120000, because that file has
-- already been applied to staging. Editing it would change no database and
-- leave it describing functions it did not create -- the mistake recorded in
-- the header of 20260916130000, where badges.icon was added to an applied
-- migration and staging returned 400 on every badge query.
--
--
-- THE GAP THIS CLOSES
--
-- CSLB publishes every licence number on a public website. Verification as
-- shipped proves a number is real, current, clear and C-10. It proves nothing
-- at all about who typed it. Anyone could read a contractor's number off the
-- register and hold a verified badge with it.
--
-- Two checks, both inside cslb_evaluate_license() so the decision table stays
-- in one place:
--
--   8. already_claimed -- the number is on somebody else's verified badge
--   9. name_mismatch   -- the business name on the account does not resemble
--                         the business name on the CSLB record
--
-- They sit AFTER the licence-quality checks and before verifying, because they
-- ask a different question. Checks 4 to 7 ask "is this licence any good"; these
-- two ask "is it yours". A suspended licence should report as suspended even if
-- it is also claimed twice.
--
-- NEITHER REJECTS. Same rule as every other reason: both send the request to a
-- human. A name mismatch in particular is expected to fire on legitimate
-- accounts -- a sole owner trading under their own name, a DBA, a spelling. The
-- asymmetry is deliberate and is the whole design: a false mismatch costs one
-- person one minute, and a false match hands someone else's licence to a
-- stranger.
--
--
-- WHAT THIS FILE ALSO DOES, BEYOND THE TWO CHECKS
--
-- A UNIQUE INDEX makes "never two verified badges on one number" an invariant
-- rather than a rule reviewers are asked to remember. Section 5. That index is
-- also what makes the already_claimed lookup an index probe rather than a scan,
-- so it is one object doing both jobs.
--
-- Because staging has already run a sweep, section 4 demotes any duplicate that
-- is already there before the index is created. Without it this migration would
-- fail on a unique violation against data its own predecessor produced.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The two new reasons
-- -----------------------------------------------------------------------------

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
        'stale_data',
        'already_claimed',
        'name_mismatch'
      )
    );


-- -----------------------------------------------------------------------------
-- 2. Which other account is holding it
--
-- "Show the reviewer both accounts" needs the other account to be recorded, not
-- described in a sentence. A column rather than prose in notes for the same
-- reason reason itself is a column: the panel renders a link from it.
--
-- ON DELETE SET NULL, not CASCADE. If the conflicting account is deleted the
-- audit row must survive -- it is the record of why this badge was held back,
-- and deleting the other party does not unmake that history.
-- -----------------------------------------------------------------------------

alter table public.user_badge_reviews
  add column if not exists conflicting_profile_id uuid
    references public.profiles (id) on delete set null;

comment on column public.user_badge_reviews.conflicting_profile_id is
  'On an already_claimed check, the account that already holds a verified '
  'badge for this licence number. NULL on every other reason. Admin-only, like '
  'the rest of this table.';


-- -----------------------------------------------------------------------------
-- 3. Business-name comparison
--
-- THREE FUNCTIONS RATHER THAN ONE EXPRESSION, so the normalisation can be
-- called on its own when someone wants to know why a pair did or did not match.
--
-- cslb_business_tokens() reduces a name to the set of words that carry
-- identity: lower cased, punctuation replaced by spaces, then the words that
-- appear in almost every contractor's name removed. "Acme Electric, Inc." and
-- "ACME ELECTRICAL" both become {acme}.
--
-- THE STOP LIST IS SHORT ON PURPOSE. It holds legal-form suffixes and the trade
-- words, and stops there. It is tempting to add services, construction,
-- solutions, group -- and every word added makes two different businesses more
-- likely to collapse onto the same token set. A word removed is a word that can
-- no longer tell two companies apart, and telling two companies apart is the
-- entire job here.
--
-- MATCHING IS SUBSET, EITHER WAY ROUND. {acme} matches {acme, electric} and
-- {randall, dockery} matches {dockery, randall, mark} -- which matters, because
-- CSLB writes sole owners both ways in the same file: row one of the 2026-09-19
-- download has BusinessName "DOCKERY RANDALL MARK" and FullBusinessName
-- "RANDALL MARK DOCKERY". Subset handles reordering, a missing middle name, and
-- a dropped suffix, which are the three ordinary ways a real name fails to be
-- string-equal.
--
-- AN EMPTY SET NEVER MATCHES. Without this guard the empty set is a subset of
-- everything, so an account with no business name -- or one called "Electric
-- Co", which normalises to nothing -- would match every licence in the file.
-- That is the one false match this design absolutely cannot have, and it is the
-- reason cslb_tokens_overlap() tests both lengths before it tests containment.
--
-- MEASURED AGAINST THE 2026-09-19 FILE, all 29,123 C-10 licences:
--
--   29,107 (99.94%) match themselves -- a contractor who types the name CSLB
--          has on record verifies automatically.
--
--       16 (0.05%) CANNOT EVER AUTO-VERIFY, because both published names
--          normalise to nothing: "THE ELECTRIC COMPANY", "ELECTRICAL",
--          "ELECTRIC CO", "THE ELECTRICIAN", "LP ELECTRIC". Every word in them
--          is a legal form or the trade. Those sixteen go to a human once and
--          get approved by hand, which is the correct outcome -- the
--          alternative is letting a name made entirely of stop words match
--          every licence in California.
--
--    8,744 normalise to a single token ("WRIGHT ELECTRIC" -> {wright}), which
--          is where subset matching is loosest. Someone claiming just "Wright"
--          against a Wright Electric licence matches. That is the looseness
--          asked for, and it is still gated behind the licence also being
--          real, clear, current, C-10 and unclaimed.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_business_tokens(p_name text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array(
      select distinct t
      from unnest(
        string_to_array(
          btrim(
            regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')
          ),
          ' '
        )
      ) as t
      where t <> ''
        and not (t = any (array[
          -- legal form
          'inc', 'incorporated', 'llc', 'llp', 'lp', 'ltd', 'limited',
          'corp', 'corporation', 'co', 'company', 'dba',
          -- articles and conjunctions left behind by the punctuation strip
          'the', 'and', 'of',
          -- the trade itself: present in a large share of C-10 names and
          -- therefore carrying no identity
          'electric', 'electrical', 'electrician', 'electricians'
        ]))
      order by t
    ),
    '{}'::text[]
  );
$$;

comment on function public.cslb_business_tokens(text) is
  'A business name reduced to its identifying words: lower cased, punctuation '
  'stripped, legal-form suffixes and trade words removed, sorted and '
  'deduplicated. Deliberately a short stop list -- every word added makes two '
  'different businesses more likely to collapse together.';


create or replace function public.cslb_tokens_overlap(p_a text[], p_b text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(p_a, 1), 0) > 0
     and coalesce(array_length(p_b, 1), 0) > 0
     and (p_a <@ p_b or p_b <@ p_a);
$$;

comment on function public.cslb_tokens_overlap(text[], text[]) is
  'Whether one token set contains the other, in either direction. An empty set '
  'never matches, which is the guard that stops a blank or fully-stopped-out '
  'business name matching every licence in the file.';


create or replace function public.cslb_names_match(
  p_claimed text,
  p_cslb_business text,
  p_cslb_full text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.cslb_tokens_overlap(
           public.cslb_business_tokens(p_claimed),
           public.cslb_business_tokens(p_cslb_business)
         )
      or public.cslb_tokens_overlap(
           public.cslb_business_tokens(p_claimed),
           public.cslb_business_tokens(p_cslb_full)
         );
$$;

comment on function public.cslb_names_match(text, text, text) is
  'Whether the business name on the account resembles either name on the CSLB '
  'record. Loose by design: a false mismatch sends one request to a human, a '
  'false match hands over somebody else''s licence.';


-- -----------------------------------------------------------------------------
-- 4. Demote duplicates that already exist
--
-- MUST RUN BEFORE SECTION 5. Staging has already had 20260921130000 and its
-- sweep, so a duplicate claim could already be sitting there as two verified
-- badges. Creating the unique index over that would fail, and the migration
-- would abort on data produced by its own predecessor.
--
-- The OLDEST award wins, by awarded_at then id. Not a judgement about who is
-- entitled to the licence -- nobody here knows that -- but a rule that is
-- deterministic, reproducible between staging and production, and biased
-- towards not disturbing the account that has held the badge longest. Every
-- other holder goes back to review with the conflict recorded, which is where a
-- human decides.
-- -----------------------------------------------------------------------------

do $$
declare
  dup     record;
  demoted integer := 0;
begin
  for dup in
    select id, keeper
    from (
      select
        ub.id,
        first_value(ub.id) over w as keeper,
        row_number()        over w as rn
      from public.user_badges ub
      where ub.badge_key = 'license_verified'
        and ub.status = 'verified'
        and public.cslb_normalise_license(
              ub.submitted_fields ->> 'license_number'
            ) is not null
      window w as (
        partition by public.cslb_normalise_license(
                       ub.submitted_fields ->> 'license_number'
                     )
        order by ub.awarded_at asc nulls last, ub.id asc
      )
    ) ranked
    where ranked.rn > 1
  loop
    update public.user_badges
       set status      = 'pending',
           awarded_at  = null,
           expires_at  = null,
           reviewed_by = null,
           reviewed_at = now()
     where id = dup.id;

    insert into public.user_badge_reviews (
      user_badge_id, reviewer_id, decision, source,
      checked_identifier, reason, conflicting_profile_id, notes
    )
    select
      dup.id,
      null,
      'needs_review',
      'cslb_import',
      public.cslb_normalise_license(ub.submitted_fields ->> 'license_number'),
      'already_claimed',
      (select k.profile_id from public.user_badges k where k.id = dup.keeper),
      'Demoted by 20260921140000: this licence number was verified on more '
      'than one account before the one-licence-one-badge rule existed.'
    from public.user_badges ub
    where ub.id = dup.id;

    demoted := demoted + 1;
  end loop;

  if demoted > 0 then
    raise notice
      'cslb: % duplicate licence badge(s) sent back to review before the '
      'uniqueness index was created.', demoted;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. One licence, one verified badge -- as an invariant
--
-- A UNIQUE INDEX RATHER THAN A RULE IN THE REVIEW UI. "An admin approving the
-- second claim should have to revoke the first" is a sentence a reviewer can
-- forget at four o'clock on a Friday. This makes it something the database
-- refuses, so the approve action in the panel has to revoke the other badge
-- first and cannot accidentally not.
--
-- PARTIAL, on verified rows only. A pending or rejected claim on the same
-- number is exactly what the review queue is for -- two people asking is fine,
-- two people holding is not.
--
-- NULLs are distinct in a unique index, so any number of badges with no licence
-- number coexist without tripping it.
--
-- It is also the index behind the already_claimed lookup in section 6. One
-- object, both jobs -- the expression is identical and there is no reason to
-- maintain two.
--
-- cslb_normalise_license() is IMMUTABLE, which is what allows it in an index
-- expression. That matters more than it looks: indexing the raw
-- submitted_fields value instead would only hold while every writer remembered
-- to normalise, and this way the invariant does not depend on any of them.
-- -----------------------------------------------------------------------------

create unique index if not exists user_badges_verified_license_unique_idx
  on public.user_badges (
    public.cslb_normalise_license(submitted_fields ->> 'license_number')
  )
  where badge_key = 'license_verified' and status = 'verified';

comment on index public.user_badges_verified_license_unique_idx is
  'One verified license_verified badge per licence number. Enforces the '
  'one-licence-one-badge rule in the database rather than in review practice, '
  'and serves the already_claimed lookup in cslb_evaluate_license().';


-- -----------------------------------------------------------------------------
-- 6. cslb_evaluate_license -- rebuilt with checks 8 and 9
--
-- THE SIGNATURE CHANGES, so the old one is dropped rather than replaced.
-- `create or replace` with a different argument list creates an OVERLOAD, and
-- two functions answering the same question with different amounts of evidence
-- is precisely the failure this file exists to prevent.
--
-- It needs two things it did not before:
--
--   p_profile_id    -- to know whose claim this is, so "already claimed" can
--                      mean "claimed by somebody else" rather than "claimed"
--   p_business_name -- the name on the account, from the C-10 credentials
--
-- The full table, in order, first match wins, NULL means verify:
--
--   1. no digits in what the user typed    -> no_number
--   2. data older than 30 days, or none    -> stale_data
--   3. number not in cslb_licenses         -> not_found
--   4. primary_status <> 'CLEAR'           -> suspended
--   5. secondary_status mentions susp      -> pending_suspension
--   6. C10 not in class_keys               -> wrong_classification
--   7. expiration_date before today        -> expired
--   8. verified on another profile         -> already_claimed
--   9. business name does not resemble it  -> name_mismatch
--  10. otherwise                           -> verify
--
-- claimed_by is returned only for already_claimed. A suspended licence may also
-- happen to be claimed twice; reporting the other account on that card would
-- point a reviewer at a second problem while they are looking at the first.
-- -----------------------------------------------------------------------------

drop function if exists public.cslb_apply_check(uuid, text, boolean);
drop function if exists public.cslb_evaluate_license(text);

create or replace function public.cslb_evaluate_license(
  p_license       text,
  p_profile_id    uuid,
  p_business_name text
)
returns table (
  reason             text,
  checked_identifier text,
  checked_status     text,
  checked_expires_on date,
  source_as_of       date,
  business_name      text,
  city               text,
  county             text,
  claimed_by         uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lic      text;
  age_days integer;
  vintage  date;
  rec      public.cslb_licenses%rowtype;
  claimant uuid;
  name_ok  boolean;
  verdict  text;
begin
  lic := public.cslb_normalise_license(p_license);

  select max(i.source_as_of) into vintage from public.cslb_imports i;
  age_days := current_date - vintage;

  if lic is null then
    return query select
      'no_number'::text, null::text, null::text, null::date,
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  if vintage is null or age_days > 30 then
    return query select
      'stale_data'::text, lic, null::text, null::date,
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  select * into rec from public.cslb_licenses l where l.license_no = lic;

  if not found then
    return query select
      'not_found'::text, lic, null::text, null::date,
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  -- `is distinct from` rather than <>: a NULL p_profile_id must not silently
  -- turn this check off by making every comparison NULL.
  select ub.profile_id into claimant
  from public.user_badges ub
  where ub.badge_key = 'license_verified'
    and ub.status = 'verified'
    and ub.profile_id is distinct from p_profile_id
    and public.cslb_normalise_license(
          ub.submitted_fields ->> 'license_number'
        ) = lic
  limit 1;

  name_ok := public.cslb_names_match(
    p_business_name, rec.business_name, rec.full_business_name
  );

  verdict := case
    when rec.primary_status is distinct from 'CLEAR' then 'suspended'
    when coalesce(rec.secondary_status, '') ~* 'susp' then 'pending_suspension'
    when not ('C10' = any (rec.class_keys)) then 'wrong_classification'
    when rec.expiration_date is null
      or rec.expiration_date < current_date then 'expired'
    when claimant is not null then 'already_claimed'
    when not name_ok then 'name_mismatch'
    else null
  end;

  return query select
    verdict,
    lic,
    rec.primary_status,
    rec.expiration_date,
    rec.source_as_of,
    coalesce(nullif(btrim(rec.business_name), ''), rec.full_business_name),
    rec.city,
    rec.county,
    case when verdict = 'already_claimed' then claimant else null end;
end;
$$;

comment on function public.cslb_evaluate_license(text, uuid, text) is
  'The C-10 verification decision table, in one place. Ten rules, first match '
  'wins, NULL reason means verify. Checks 8 and 9 -- already_claimed and '
  'name_mismatch -- ask whether the licence belongs to this account, which the '
  'first seven do not: CSLB publishes every number publicly, so a clean licence '
  'proves the number is real and nothing about who typed it.';


-- -----------------------------------------------------------------------------
-- 7. cslb_apply_check -- takes the business name, records the conflict
--
-- Unchanged in every other respect, and reproduced in full rather than patched
-- because a function is replaced whole. The behaviour that is NOT changing and
-- is easy to lose in a rewrite:
--
--   - revoked is never touched, on either path
--   - rejected is left alone unless the credential itself changed
--   - a verified badge is never knocked back by stale_data, nor by not_found
--     on a badge a human approved
--   - nothing is written when status, expiry and reason all match last time
--
-- THE NEW REASONS ARE NOT IN THAT EXEMPT LIST, deliberately. already_claimed
-- and name_mismatch are findings, not absences of evidence, so a verified badge
-- does lose its verification when a sweep turns one up. That is the point:
-- these run over everyone on every import, so a claim that only becomes a
-- conflict later is still caught.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_apply_check(
  p_profile_id    uuid,
  p_license       text,
  p_business_name text,
  p_after_edit    boolean default false
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

  select * into ev
  from public.cslb_evaluate_license(p_license, p_profile_id, p_business_name);

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
    awarded_at       = case
                         when excluded.status = 'verified'
                           then coalesce(user_badges.awarded_at, now())
                         else null
                       end,
    expires_at       = excluded.expires_at,
    rejection_reason = null,
    reviewed_by      = null,
    reviewed_at      = now()
  returning id into badge_id;

  -- The note is what the reviewer reads first. Both names go in it whenever
  -- there are two, because on a name_mismatch card the single most useful
  -- thing is the pair side by side.
  if ev.business_name is not null then
    note := 'CSLB record: ' || ev.business_name
         || coalesce(', ' || nullif(btrim(ev.city), ''), '')
         || coalesce(' (' || nullif(btrim(ev.county), '') || ' County)', '');
  end if;

  if nullif(btrim(coalesce(p_business_name, '')), '') is not null then
    note := coalesce(note || '. ', '')
         || 'Account business name: ' || btrim(p_business_name);
  end if;

  insert into public.user_badge_reviews (
    user_badge_id, reviewer_id, decision, source,
    checked_identifier, checked_status, checked_expires_on, source_as_of,
    reason, conflicting_profile_id, notes
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
    ev.claimed_by,
    note
  );

  return case
    when ev.reason is null then 'verified'
    else 'review:' || ev.reason
  end;
end;
$$;

comment on function public.cslb_apply_check(uuid, text, text, boolean) is
  'Runs cslb_evaluate_license() for one profile and writes the badge plus an '
  'audit row. Never touches a revoked badge, leaves a rejected one alone unless '
  'the credential just changed, and never knocks a verified badge back over '
  'stale data. It DOES knock one back for already_claimed or name_mismatch -- '
  'those are findings, not absences of evidence.';


-- -----------------------------------------------------------------------------
-- 8. The trigger now passes the business name
--
-- Both live in the same role_credentials.fields object, written by
-- lib/signupRoles.tsx as business_name and license_number, so there is nothing
-- extra to read.
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
    new.fields ->> 'business_name',
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


-- -----------------------------------------------------------------------------
-- 9. The sweep now passes the business name
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
  select b.active into badge_live
  from public.badges b
  where b.key = 'license_verified';

  if not coalesce(badge_live, false) then
    return query select 'skipped:badge_inactive'::text, 0;
    return;
  end if;

  -- ORDER MATTERS NOW, in one narrow way. Two profiles claiming one number can
  -- only end with one verified, and which one it is depends on which is
  -- evaluated first. Oldest credential first, so the result is deterministic
  -- and reproducible between staging and production rather than whatever order
  -- the planner happened to return.
  for rec in
    select
      rc.profile_id,
      rc.fields ->> 'license_number' as license,
      rc.fields ->> 'business_name'  as business_name
    from public.role_credentials rc
    join public.profiles p on p.id = rc.profile_id
    where rc.role_key = 'contractor'
      and p.signup_type = 'c10'
    order by rc.created_at asc, rc.profile_id asc
  loop
    begin
      result := public.cslb_apply_check(
        rec.profile_id, rec.license, rec.business_name, false
      );
    exception
      when others then
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


-- -----------------------------------------------------------------------------
-- 10. Grants for the new signatures
--
-- The old ones went with the dropped functions. Everything here stays internal:
-- the decision table and the writers are reachable from the trigger, from the
-- sweep, and from the import script's service_role connection, and from nowhere
-- a browser can get to.
-- -----------------------------------------------------------------------------

revoke all on function public.cslb_evaluate_license(text, uuid, text)        from anon, authenticated;
revoke all on function public.cslb_apply_check(uuid, text, text, boolean)    from anon, authenticated;
revoke all on function public.cslb_business_tokens(text)                     from anon, authenticated;
revoke all on function public.cslb_tokens_overlap(text[], text[])            from anon, authenticated;
revoke all on function public.cslb_names_match(text, text, text)             from anon, authenticated;

grant execute on function public.cslb_evaluate_license(text, uuid, text)     to service_role;
grant execute on function public.cslb_apply_check(uuid, text, text, boolean) to service_role;
grant execute on function public.cslb_business_tokens(text)                  to service_role;
grant execute on function public.cslb_tokens_overlap(text[], text[])         to service_role;
grant execute on function public.cslb_names_match(text, text, text)          to service_role;


-- -----------------------------------------------------------------------------
-- 11. Re-check everyone against the two new rules
--
-- Guarded on the data being present and current, exactly as 20260921130000 is
-- and for the same reason: against a missing or stale import this would fill
-- the queue with entries whose stated reason is about our own data rather than
-- anybody's licence.
--
-- Expect this to move badges. Every currently-verified C-10 whose business name
-- does not resemble the CSLB record goes back to review here -- that is the
-- check doing its job on accounts that were verified before it existed, not a
-- fault.
-- -----------------------------------------------------------------------------

do $$
declare
  age_days integer;
  tally    text;
begin
  age_days := public.cslb_data_age_days();

  if age_days is null or age_days > 30 then
    raise warning
      'cslb: ownership checks are live but the import is missing or stale, so '
      'the re-check was skipped. Run scripts/import-cslb.mjs -- its post-import '
      'sweep does what was skipped here.';
    return;
  end if;

  select string_agg(r.outcome || '=' || r.accounts, ', ' order by r.outcome)
    into tally
  from public.cslb_recheck_all() r;

  raise notice 'cslb: ownership re-check: %',
    coalesce(tally, 'no C-10 contractors found');
end;
$$;
