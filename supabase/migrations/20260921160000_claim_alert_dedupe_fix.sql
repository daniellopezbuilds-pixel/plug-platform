-- =============================================================================
-- Fix: the held-back-claim alert never fires
--
-- STATUS: not yet applied. Staging first.
--
-- SYMPTOM, from staging on 2026-09-21. mcannon@gmail.com's licence was changed
-- to 1000010, already verified on contractor@demo.sparxplug.com. The block
-- worked -- mcannon's badge went to pending with check_reason
-- 'already_claimed', and the contractor-facing message was correct. But
-- email_outbox held zero rows and the holder got no notification. The whole
-- alert branch was skipped, not just the email.
--
--
-- CAUSE: THE DEDUPE MEASURED THE WRONG THING.
--
-- 20260921150000 suppressed a repeat alert by asking whether an already_claimed
-- REVIEW ROW existed for this badge and holder in the last seven days:
--
--   select exists (
--     select 1 from public.user_badge_reviews r
--     where r.user_badge_id = badge_id
--       and r.reason = 'already_claimed'
--       and r.conflicting_profile_id = ev.claimed_by
--       and r.reviewed_at > now() - interval '7 days'
--   ) into already_warned;
--
-- A review row and an alert are not the same event, and they come apart in at
-- least three ways:
--
--   1. EVERY REVIEW ROW WRITTEN BEFORE 20260921150000 SHIPPED. Alerting did not
--      exist then, so those rows record a conflict nobody was told about. This
--      is what happened on staging: an already_claimed row from 21:37 -- before
--      the alerting migration -- suppressed the alert for the identical
--      conflict at 23:19. The feature could not fire even once for any conflict
--      first seen in the preceding week.
--   2. An alert that was queued and never delivered still leaves a review row.
--   3. Any future writer of a review row silently consumes an alert.
--
-- The question worth asking is "have we told this person recently", and the
-- only honest place to read that is the notification itself.
--
--
-- THE FIX, and why it is a separate function
--
-- cslb_raise_claim_alert() now owns the decision and both writes. It is a
-- function rather than an inline block because the backfill in section 4 has to
-- do exactly the same thing for conflicts already sitting on the table, and two
-- copies of a security alert's wording and dedupe rule is how they drift.
--
-- Note the dedupe is now PER HOLDER rather than per (badge, holder). A profile
-- holds at most one license_verified badge and therefore at most one licence,
-- so the narrower key bought nothing; and if two different people both try the
-- same licence in one week, one warning is the right number.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Supporting index
--
-- The dedupe reads notifications by (user_id, type) on every blocked claim, and
-- nothing indexed that. It also covers the notification bell's own query --
-- user_id, newest first -- which until now was a scan of the table.
-- -----------------------------------------------------------------------------

create index if not exists notifications_user_type_created_idx
  on public.notifications (user_id, type, created_at desc);


-- -----------------------------------------------------------------------------
-- 2. cslb_raise_claim_alert -- the alert, its dedupe, and nothing else
--
-- Returns whether it actually raised one, so a caller can report a count.
--
-- IT NAMES NOBODY. Unchanged from 20260921150000 and worth restating because
-- the wording now lives in one place: the holder is told their licence was
-- entered on another account, and not by whom. A blocked claim is far more
-- often a typo than a theft, and naming the other party turns our
-- mistake-handling into an accusation delivered by email. The admin queue has
-- both accounts; that is where a human decides.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_raise_claim_alert(
  p_holder_id uuid,
  p_license   text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  holder_email text;
  holder_name  text;
begin
  if p_holder_id is null then
    return false;
  end if;

  -- The dedupe, measured on the alert itself. See the header for why this is
  -- not a question about user_badge_reviews.
  if exists (
    select 1
    from public.notifications n
    where n.user_id = p_holder_id
      and n.type = 'license_claim_attempt'
      and n.created_at > now() - interval '7 days'
  ) then
    return false;
  end if;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    p_holder_id,
    'license_claim_attempt',
    'Someone entered your licence number',
    'A C-10 licence number matching your verified badge was entered on '
    || 'another account. We blocked it -- your badge is unaffected and no '
    || 'other account can be verified with your licence. If this was you on '
    || 'a second account, contact us and we will sort it out.',
    '/dashboard/profile'
  );

  select p.email, p.full_name
    into holder_email, holder_name
  from public.profiles p
  where p.id = p_holder_id;

  -- No address, no row. An outbox entry that can never be delivered is a
  -- permanent failure the drain would retry until it hit its attempt cap.
  if nullif(btrim(coalesce(holder_email, '')), '') is not null then
    insert into public.email_outbox (to_email, subject, template, payload)
    values (
      holder_email,
      'Someone entered your contractor licence number',
      'license_claim_attempt',
      jsonb_build_object(
        'full_name', holder_name,
        'license_number', p_license
      )
    );
  end if;

  return true;
end;
$$;

comment on function public.cslb_raise_claim_alert(uuid, text) is
  'Notifies and emails the holder of a licence that somebody else tried to '
  'register, at most once per holder per seven days. Deduped on the '
  'notification actually sent, never on the review row that caused it -- those '
  'come apart, and 20260921150000 shipped with the wrong one.';

revoke all on function public.cslb_raise_claim_alert(uuid, text) from anon, authenticated;
grant execute on function public.cslb_raise_claim_alert(uuid, text) to service_role;


-- -----------------------------------------------------------------------------
-- 3. cslb_apply_check -- calls the helper, drops its own dedupe
--
-- Replaced whole, signature unchanged. The only difference from
-- 20260921150000 is the alert section at the bottom: the `already_warned`
-- variable and the user_badge_reviews lookup that set it are gone, and the two
-- inserts have moved into cslb_raise_claim_alert().
--
-- Everything else is unchanged and restated here only so a reader can check it:
--   - revoked is never touched, on either path
--   - rejected is left alone unless the credential itself changed
--   - a verified badge is never knocked back by stale_data, nor by not_found
--     on a badge a human approved
--   - nothing is written at all when status, expiry and reason match last time
--   - already_claimed and name_mismatch DO knock a verified badge back
--
-- THE "NOTHING CHANGED" EARLY RETURN IS STILL THE PRIMARY GUARD against
-- repeated alerts, and it is the correct one: a standing conflict re-evaluated
-- by next week's sweep produces no write at all, so it never reaches the alert.
-- The seven-day window only has to catch the case that early return cannot --
-- somebody editing their licence number back and forth, which is a real change
-- every time.
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
  'check_reason and an audit row. On a blocked already_claimed it calls '
  'cslb_raise_claim_alert(), which owns the once-per-week rule.';


-- -----------------------------------------------------------------------------
-- 4. Send the alerts that were swallowed
--
-- REQUIRED, not tidying. Every conflict currently sitting at already_claimed
-- got there without its holder being told, and the "nothing changed" early
-- return means re-running the sweep will not revisit any of them -- their
-- status, expiry and reason all already match. Without this backfill the fix
-- would only apply to conflicts discovered in future, and the one on staging
-- right now would stay silent for ever.
--
-- The holder comes from the newest already_claimed review row for the badge,
-- which is where cslb_apply_check recorded it.
-- -----------------------------------------------------------------------------

do $$
declare
  rec  record;
  sent integer := 0;
begin
  for rec in
    select distinct on (ub.id)
      ub.id                    as badge_id,
      r.conflicting_profile_id as holder_id,
      r.checked_identifier     as license_no
    from public.user_badges ub
    join public.user_badge_reviews r on r.user_badge_id = ub.id
    where ub.badge_key = 'license_verified'
      and ub.status = 'pending'
      and ub.check_reason = 'already_claimed'
      and r.reason = 'already_claimed'
      and r.conflicting_profile_id is not null
    order by ub.id, r.reviewed_at desc
  loop
    if public.cslb_raise_claim_alert(rec.holder_id, rec.license_no) then
      sent := sent + 1;
    end if;
  end loop;

  raise notice
    'cslb: % held-back claim alert(s) raised by backfill.', sent;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Badge descriptions that read correctly in every status
--
-- badges.description is rendered on /dashboard/profile under the badge name,
-- whatever state the badge is in. license_verified read:
--
--   "An administrator has checked this licence number against the state
--    licensing board."
--
-- which under "Awaiting review" asserts that the very thing being awaited has
-- already happened. It was also wrong in a second way once the CSLB import
-- shipped: the usual checker is not an administrator, it is the import.
--
-- The rule these now follow: a description says what the badge MEANS, not what
-- has happened to this account. State is the status line's job -- and since
-- 20260921150000 that line is specific, so the description does not need to
-- carry any of it.
--
-- business_verified had the identical defect. It is inactive and therefore
-- invisible today, which is exactly why it is worth fixing now rather than
-- rediscovering on the day someone switches it on.
-- -----------------------------------------------------------------------------

update public.badges
   set description =
     'Awarded when your C-10 licence number checks out against California''s '
     'CSLB register.'
 where key = 'license_verified';

update public.badges
   set description =
     'Awarded when an administrator confirms this is a registered business.'
 where key = 'business_verified';
