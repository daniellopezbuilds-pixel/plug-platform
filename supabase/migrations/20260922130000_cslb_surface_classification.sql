-- =============================================================================
-- CSLB: say WHICH classification the licence holds
--
-- 20260922120000 made `wrong_classification` reachable. It says the licence is
-- not a C-10 and stops there, so the reviewer's next move is to open the CSLB
-- site and look up a number we have already looked up. The answer was in the
-- row the whole time: class_keys, which is what rule 4 decided on.
--
-- So it is carried out of the decision table, through the audit row, and onto
-- the card: "C-36 Plumbing" rather than "not a C-10".
--
-- FOUR THINGS MOVE, and this file is two of them:
--
--   cslb_evaluate_license   returns checked_classifications text[]   (section 2)
--   user_badge_reviews      gains a column to record it              (section 1)
--   cslb_apply_check        writes it onto the audit row             (section 3)
--   the admin card          renders it, labelled                     (lib/cslb.tsx,
--                                                                     components/admin)
--
-- WHY text[] AND NOT THE RAW STRING. cslb_licenses carries both: `classifications`
-- as CSLB published it ('A| B| C10| C36') and `class_keys` parsed ({A,B,C10,C36}).
-- The parsed array is what rule 4 evaluated, so recording it makes the audit row
-- show the evidence the decision was actually made on rather than a string it
-- was derived from. It is also the form the card can label per entry; splitting
-- the raw string again in TypeScript would be a second parser, disagreeing with
-- parseClassifications() the first week CSLB changes a separator.
--
-- POPULATED ON EVERY PATH THAT FOUND A LICENCE, not only on wrong_classification.
-- A C-10 who also holds A and B is useful context on a suspended or expired
-- card too, and it costs a column that is already being read. It stays NULL for
-- no_number, stale_data and not_found, which never read a row.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The audit column
--
-- NOT constrained against a list of known classifications. CSLB retires codes
-- and keeps issuing licences that carry them -- the 2026-09-19 file has 98
-- distinct keys, including a dozen D-codes no longer issued at all. A CHECK
-- here would reject an audit row for a licence that genuinely says D-37, which
-- is the one case where the reviewer most needs to see what the file said.
-- The label lookup in lib/cslb.tsx falls back to the bare code for exactly the
-- same reason.
-- -----------------------------------------------------------------------------

alter table public.user_badge_reviews
  add column if not exists checked_classifications text[];

comment on column public.user_badge_reviews.checked_classifications is
  'The classifications on the CSLB record, parsed: {A,B,C10,C36}. What rule 4 '
  'of cslb_evaluate_license() actually decided on, so a wrong_classification '
  'row records which classification it was. NULL where no record was read -- '
  'no_number, stale_data, not_found -- and on a manual review, where the '
  'reviewer has the CSLB page open and the note is the place for what it said.';


-- -----------------------------------------------------------------------------
-- 2. cslb_evaluate_license -- one more returned column
--
-- Dropped and recreated: the returns table grows, which `create or replace`
-- cannot do. Grants go with the old function and are restated in section 4.
--
-- THE DECISION TABLE IS UNCHANGED. Same ten rules, same order, same outcomes --
-- this adds an output column and touches no branch. 20260922120000 remains the
-- file to read for why classification is rule 4.
--
--   1. no digits in what the user typed    -> no_number
--   2. data older than 30 days, or none    -> stale_data
--   3. number not in cslb_licenses         -> not_found
--   4. C10 not in class_keys               -> wrong_classification
--   5. primary_status <> 'CLEAR'           -> suspended
--   6. secondary_status mentions susp      -> pending_suspension
--   7. expiration_date before today        -> expired
--   8. verified on another profile         -> already_claimed
--   9. business name does not resemble it  -> name_mismatch
--  10. otherwise                           -> verify
-- -----------------------------------------------------------------------------

drop function if exists public.cslb_evaluate_license(text, uuid, text);

create or replace function public.cslb_evaluate_license(
  p_license       text,
  p_profile_id    uuid,
  p_business_name text
)
returns table (
  reason                  text,
  checked_identifier      text,
  checked_status          text,
  checked_expires_on      date,
  checked_classifications text[],
  source_as_of            date,
  business_name           text,
  city                    text,
  county                  text,
  claimed_by              uuid
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
      'no_number'::text, null::text, null::text, null::date, null::text[],
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  if vintage is null or age_days > 30 then
    return query select
      'stale_data'::text, lic, null::text, null::date, null::text[],
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  select * into rec from public.cslb_licenses l where l.license_no = lic;

  if not found then
    return query select
      'not_found'::text, lic, null::text, null::date, null::text[],
      vintage, null::text, null::text, null::text, null::uuid;
    return;
  end if;

  -- Rule 4, answered before anything below reads a column a slim row does not
  -- have. Returned on its own rather than folded into the case below, so the
  -- ordering is a property of the function rather than of the order somebody
  -- happens to leave the branches in.
  --
  -- class_keys IS the answer here, which is the whole point of this migration:
  -- the reviewer is told the licence is a C-36 rather than told to go and find
  -- out. checked_status stays NULL -- a slim row has no status, and reporting
  -- one for a licence in the wrong classification would invite a reviewer to
  -- weigh it.
  if not ('C10' = any (rec.class_keys)) then
    return query select
      'wrong_classification'::text, lic, null::text, null::date, rec.class_keys,
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
    rec.class_keys,
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
  'with no names or statuses at all. Returns the classifications it read, so '
  'the reviewer is told WHICH one rather than only that it was wrong. Checks 8 '
  'and 9 -- already_claimed and name_mismatch -- ask whether the licence '
  'belongs to this account, which the first seven do not: CSLB publishes every '
  'number publicly, so a clean licence proves the number is real and nothing '
  'about who typed it.';


-- -----------------------------------------------------------------------------
-- 3. cslb_apply_check -- carry it onto the audit row
--
-- Replaced whole, signature unchanged, because a function is replaced whole.
-- THE ONLY DIFFERENCE from 20260921160000 is one column in the
-- user_badge_reviews insert. Everything else is restated verbatim so a reader
-- can check that, and the behaviour that is easy to lose in a rewrite is the
-- same list it has been since 20260921150000:
--
--   - revoked is never touched, on either path
--   - rejected is left alone unless the credential itself changed
--   - a verified badge is never knocked back by stale_data, nor by not_found
--     on a badge a human approved
--   - nothing is written at all when status, expiry and reason match last time
--   - already_claimed and name_mismatch DO knock a verified badge back
--   - the claim alert's once-per-week rule lives in cslb_raise_claim_alert()
--
-- The "nothing changed" early return deliberately does NOT compare
-- classifications. A licence that adds a classification while its status,
-- expiry and outcome all stay the same is not a verification event, and making
-- it write a row would put a fresh audit entry -- and on already_claimed, an
-- email -- in front of a reviewer every week for a change that did not affect
-- the decision. The column is evidence for a decision, not a change feed.
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
  ev             record;
  badge          public.user_badges%rowtype;
  has_badge      boolean;
  last_decision  text;
  last_source    text;
  last_reason    text;
  want_status    text;
  want_expiry    timestamptz;
  badge_id       uuid;
  note           text;
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
     and badge.check_reason is not distinct from ev.reason
     and last_reason is not distinct from ev.reason then
    return 'unchanged';
  end if;

  insert into public.user_badges (
    profile_id, badge_key, status, submitted_fields, check_reason,
    awarded_at, expires_at, rejection_reason, reviewed_by, reviewed_at
  )
  values (
    p_profile_id,
    'license_verified',
    want_status,
    jsonb_build_object('license_number', coalesce(ev.checked_identifier, '')),
    ev.reason,
    case when want_status = 'verified' then now() else null end,
    want_expiry,
    null,
    null,
    now()
  )
  on conflict (profile_id, badge_key) do update set
    status           = excluded.status,
    submitted_fields = excluded.submitted_fields,
    check_reason     = excluded.check_reason,
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
    checked_identifier, checked_status, checked_expires_on,
    checked_classifications, source_as_of,
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
    ev.checked_classifications,
    ev.source_as_of,
    ev.reason,
    ev.claimed_by,
    note
  );

  -- The security alert. The helper owns the dedupe, so this is unconditional
  -- beyond the reason -- and it no longer matters in what order the review row
  -- and the alert are written, which is what made the old version fragile.
  if ev.reason = 'already_claimed' then
    perform public.cslb_raise_claim_alert(ev.claimed_by, ev.checked_identifier);
  end if;

  return case
    when ev.reason is null then 'verified'
    else 'review:' || ev.reason
  end;
end;
$$;

comment on function public.cslb_apply_check(uuid, text, text, boolean) is
  'Runs cslb_evaluate_license() for one profile and writes the badge, its '
  'check_reason and an audit row -- including the classifications the record '
  'carried, so a wrong_classification row says which one. On a blocked '
  'already_claimed it calls cslb_raise_claim_alert(), which owns the '
  'once-per-week rule.';


-- -----------------------------------------------------------------------------
-- 4. Grants
--
-- cslb_evaluate_license was dropped, which took its grants with it.
-- cslb_apply_check kept its signature and therefore its grants; restated for
-- the same reason as in 20260922120000.
-- -----------------------------------------------------------------------------

revoke all on function public.cslb_evaluate_license(text, uuid, text)       from anon, authenticated;
revoke all on function public.cslb_apply_check(uuid, text, text, boolean)   from anon, authenticated;

grant execute on function public.cslb_evaluate_license(text, uuid, text)     to service_role;
grant execute on function public.cslb_apply_check(uuid, text, text, boolean) to service_role;
