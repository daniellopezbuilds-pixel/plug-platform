-- =============================================================================
-- CSLB: import every classification, decide on classification first
--
-- WHY. The import filtered the Master List to the 29,123 licences holding C10
-- before inserting, so a licence in any other classification was simply absent
-- from cslb_licenses -- and cslb_evaluate_license() reported it as `not_found`,
-- which is a claim about the CSLB register rather than about our copy of it.
--
-- The case that found this: licence 1117700 is real, current, CLEAR, and
-- expires 2028-03-31. It is a C-36 plumbing licence. A C-36 holder asking for a
-- C-10 badge was told "we couldn't find this licence number on the CSLB
-- register", which is false and unactionable -- they can check the digits all
-- day and the digits are right.
--
-- `wrong_classification` has existed since 20260921120000: in the CHECK
-- constraint, at rule 6 of the decision table, with reviewer and owner copy
-- written for it in lib/cslb.tsx. It has never once fired, because the import
-- guaranteed every row in the table satisfied it. This migration is the half of
-- that feature that was missing.
--
-- WHAT CHANGES HERE, and what changes in the script:
--
--   scripts/import-cslb.mjs  stops filtering. Non-C-10 rows are inserted SLIM
--                            -- license_no, classifications, class_keys, and
--                            nothing else.
--   this file                reorders the decision table so classification is
--                            checked before status and expiry, guards the C-10
--                            count in its own right, and re-comments the table.
--
-- WHY SLIM. 215,396 of the 244,519 rows belong to contractors who do no
-- electrical work and will never hold an account here. Their names, cities and
-- counties answer no question this table is asked: once the classification is
-- wrong, the check is over. The header of scripts/import-cslb.mjs already sets
-- the rule -- holding a contractor's record to answer a question it is not
-- needed for "would be a choice to store personal data with no use" -- and
-- importing the other 215k in full would have broken it at scale. Measured
-- against the 2026-09-19 file, slim rows cost ~15MB where full rows cost ~40MB.
--
-- WHY THE REORDER IS SAFE. Rule 6 cannot fire for any row that exists in
-- cslb_licenses today, because every row holds C10. Moving it above the status
-- checks therefore changes the outcome of exactly nothing currently in the
-- table, and only decides the rows the widened import is about to add.
--
-- It is also the reason slim is safe: a non-C-10 row is answered before
-- anything reads the columns it does not have. See section 4.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. What the table now holds
--
-- No DDL. cslb_licenses already allows NULL in every column a slim row omits,
-- and class_keys was always stored rather than assumed -- 20260921120000 said
-- why in as many words: "If the import filter ever widens, the rule stays
-- correct and no function changes." This is that widening, and the rule did
-- stay correct. Only the comments were describing a narrower table than the one
-- that is about to exist.
-- -----------------------------------------------------------------------------

comment on table public.cslb_licenses is
  'CSLB Master List of California Licensed Contractors, every classification. '
  'Rows holding C10 carry the full column set. Every other row is SLIM -- '
  'license_no, classifications and class_keys only, no names, cities or '
  'counties -- because a non-C-10 licence is decided by its classification '
  'alone and the rest would be personal data held for no question. Replaced '
  'wholesale by cslb_commit_import(). Not readable from the browser: the only '
  'readers are the SECURITY DEFINER functions in 20260921120000 and '
  '20260921140000.';

comment on column public.cslb_licenses.class_keys is
  'Classifications parsed: split on |, trimmed, hyphens stripped, upper cased. '
  'The published strings are inconsistent -- "C10", "C-6" and "A| B| C10| C36" '
  'all occur. Matching is exact against this array, never a substring, so C100 '
  'can never satisfy a C10 check. THIS COLUMN NOW DECIDES WHICH ROWS ARE '
  'COMPLETE: a row containing C10 carries every column, a row that does not is '
  'slim and carries only this one and classifications.';

comment on column public.cslb_licenses.business_name is
  'NULL on a slim (non-C-10) row. Present only where the licence holds C10.';

comment on column public.cslb_licenses.primary_status is
  'NULL on a slim (non-C-10) row. cslb_evaluate_license() answers '
  'wrong_classification before it reads this, so a NULL here is never read as '
  'a status -- see section 4.';


-- -----------------------------------------------------------------------------
-- 2. The C-10 count becomes a guard, not just a statistic
--
-- THE FILTER WAS LOAD-BEARING AND NOBODY WROTE THAT DOWN. cslb_commit_import()
-- refuses an import whose row count has fallen below 90% of the last one, so a
-- truncated download cannot wipe verification. While the script filtered to
-- C10, that count WAS the C-10 count, and the guard covered the thing that
-- actually matters: how many electrical contractors we can still verify.
--
-- Widening the import silently ends that. The failure it stops covering: CSLB
-- renames or respells the Classifications(s) column, parseClassifications
-- returns {} for all 244,519 rows, the total row count is unchanged, the guard
-- is satisfied -- and every C-10 in the file becomes wrong_classification. The
-- next sweep then moves every verified electrical contractor on the platform
-- into the review queue and emails them about it.
--
-- So the C-10 count is measured, stored, and guarded on its own terms. Same
-- ratio, same force flag, separate number.
--
-- coalesce(c10_count, row_count) reads a LEGACY ledger row correctly without a
-- backfill: before this migration every imported row was a C-10, so the total
-- recorded there is the C-10 total. Neither project has imported yet, so in
-- practice this only matters on a developer's machine.
-- -----------------------------------------------------------------------------

alter table public.cslb_imports
  add column if not exists c10_count integer;

comment on column public.cslb_imports.c10_count is
  'How many of row_count held a C10 classification. Guarded separately by '
  'cslb_commit_import(): the total row count cannot detect a classification '
  'column CSLB has respelled, and that failure would report every electrical '
  'contractor in the file as wrong_classification. NULL on ledger rows written '
  'before 20260922120000, where row_count is itself the C-10 count.';


-- -----------------------------------------------------------------------------
-- 3. cslb_commit_import -- both guards
--
-- Dropped and recreated rather than replaced: the returns table gains two
-- columns, which `create or replace` cannot do. Grants go with the old
-- function, so they are restated in section 5.
--
-- Behaviour that is NOT changing and is easy to lose in a rewrite:
--
--   - empty staging is refused unless forced
--   - the replace is one transaction, so a refusal leaves the previous import
--     in place, untouched
--   - source_as_of is stamped from the argument onto every row AND onto the
--     ledger entry, so the two can never disagree
--   - staging is truncated on the way out
-- -----------------------------------------------------------------------------

drop function if exists public.cslb_commit_import(date, text, numeric, boolean);

create or replace function public.cslb_commit_import(
  p_source_as_of date,
  p_file_name    text    default null,
  p_min_ratio    numeric default 0.9,
  p_force        boolean default false
)
returns table (
  imported_rows integer,
  previous_rows integer,
  imported_c10  integer,
  previous_c10  integer,
  file_date     date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  staged     integer;
  staged_c10 integer;
  prev       integer;
  prev_c10   integer;
begin
  select
    count(*)::integer,
    (count(*) filter (where 'C10' = any (s.class_keys)))::integer
  into staged, staged_c10
  from public.cslb_licenses_staging s;

  if staged = 0 and not p_force then
    raise exception
      'cslb import refused: staging table is empty. Pass force to override.'
      using errcode = '23514';
  end if;

  select i.row_count, coalesce(i.c10_count, i.row_count)
  into prev, prev_c10
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

  -- The canary. A total row count that looks healthy while the C-10 count has
  -- collapsed is a parse failure, not a smaller file -- almost certainly the
  -- Classifications(s) column having changed its name or its separator.
  if prev_c10 is not null
     and not p_force
     and staged_c10 < floor(prev_c10 * p_min_ratio) then
    raise exception
      'cslb import refused: % C-10 licences is below % percent of the previous '
      'import (%), while the total row count (%) held up. That pattern is a '
      'classification parse failure, not a smaller file -- check the '
      'Classifications(s) column before forcing.',
      staged_c10, round(p_min_ratio * 100), prev_c10, staged
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

  insert into public.cslb_imports (source_as_of, row_count, c10_count, file_name)
  values (p_source_as_of, staged, staged_c10, p_file_name);

  truncate table public.cslb_licenses_staging;

  return query select staged, prev, staged_c10, prev_c10, p_source_as_of;
end;
$$;

comment on function public.cslb_commit_import(date, text, numeric, boolean) is
  'Replaces cslb_licenses from cslb_licenses_staging in one transaction, '
  'stamps the file date on every row, and records the import in cslb_imports. '
  'Two guards, both at p_min_ratio of the previous import: the total row '
  'count, so a truncated download cannot wipe verification, and the C-10 count '
  'on its own, so a respelled classification column cannot pass as a healthy '
  'file while reporting every electrical contractor as wrong_classification.';


-- -----------------------------------------------------------------------------
-- 4. cslb_evaluate_license -- classification before status
--
-- Reproduced in full rather than patched, because a function is replaced whole.
-- The signature is unchanged, so `create or replace` keeps the grants; they are
-- restated in section 5 anyway.
--
-- The full table, in order, first match wins, NULL means verify. Rule 4 has
-- moved up from position 6; nothing else has moved relative to anything else:
--
--   1. no digits in what the user typed    -> no_number
--   2. data older than 30 days, or none    -> stale_data
--   3. number not in cslb_licenses         -> not_found
--   4. C10 not in class_keys               -> wrong_classification   <-- moved
--   5. primary_status <> 'CLEAR'           -> suspended
--   6. secondary_status mentions susp      -> pending_suspension
--   7. expiration_date before today        -> expired
--   8. verified on another profile         -> already_claimed
--   9. business name does not resemble it  -> name_mismatch
--  10. otherwise                           -> verify
--
-- WHY 4 MOVED, on its own merits and before slim rows were a consideration. A
-- C-36 holder applying for a C-10 badge whose plumbing licence also carries a
-- bond suspension was told "suspended". True, and about a licence they did not
-- ask us about. The answer to "is this a C-10?" is no, and it is no whatever
-- the status says -- so the classification decides first and the reviewer's
-- card says the one thing that is actually in question.
--
-- WHAT IT ALSO BUYS. Rules 5, 6 and 7 read primary_status, secondary_status and
-- expiration_date, and rule 9 reads the business names. A slim row has none of
-- them. Because rule 4 answers first, none of those columns is ever read on a
-- row that does not carry them -- which is what lets the import store 215,396
-- rows without names.
--
-- STILL FAIL-SAFE IF THE IMPORT IS WRONG. If a bug ever wrote a slim row that
-- did contain C10, rule 4 would not fire and rule 5 would read a NULL
-- primary_status -- `is distinct from 'CLEAR'` is true for NULL, so it reports
-- `suspended` and goes to a human. Wrong label, right destination. NEVER
-- AUTO-REJECT holds throughout: every one of the nine outcomes is a request for
-- review.
-- -----------------------------------------------------------------------------

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

  -- Rule 4, answered before anything below reads a column a slim row does not
  -- have. Returned on its own rather than folded into the case below, so the
  -- ordering is a property of the function rather than of the order somebody
  -- happens to leave the branches in.
  --
  -- source_as_of comes from the row rather than from `vintage`, matching every
  -- other found-the-licence path: it is the vintage of the record that was
  -- read. checked_status stays NULL -- a slim row has no status, and reporting
  -- one for a licence in the wrong classification would invite a reviewer to
  -- weigh it.
  if not ('C10' = any (rec.class_keys)) then
    return query select
      'wrong_classification'::text, lic, null::text, null::date,
      rec.source_as_of, null::text, null::text, null::text, null::uuid;
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
  'wins, NULL reason means verify. Classification is rule 4, ahead of status '
  'and expiry: a licence in another classification is not a C-10 whatever its '
  'status says, and answering there is what lets the import hold non-C-10 rows '
  'with no names or statuses at all. Checks 8 and 9 -- already_claimed and '
  'name_mismatch -- ask whether the licence belongs to this account, which the '
  'first seven do not: CSLB publishes every number publicly, so a clean licence '
  'proves the number is real and nothing about who typed it.';


-- -----------------------------------------------------------------------------
-- 5. Grants
--
-- cslb_commit_import was dropped, which took its grants with it. Restated for
-- cslb_evaluate_license too: `create or replace` preserves them, and a line
-- that is a no-op today is cheaper than the day somebody changes that signature
-- and does not notice EXECUTE went with it.
-- -----------------------------------------------------------------------------

revoke all on function public.cslb_commit_import(date, text, numeric, boolean) from anon, authenticated;
revoke all on function public.cslb_evaluate_license(text, uuid, text)          from anon, authenticated;

grant execute on function public.cslb_commit_import(date, text, numeric, boolean) to service_role;
grant execute on function public.cslb_evaluate_license(text, uuid, text)          to service_role;
