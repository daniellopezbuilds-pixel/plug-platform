-- =============================================================================
-- Licence verification: telling people what happened
--
-- STATUS: not yet applied. Staging first, then production with 20260921140000.
--
-- Everything so far decides. Nothing so far tells anyone. A contractor whose
-- licence did not verify sees a badge that is simply absent, with no way to
-- learn why or what to do, and the contractor whose licence somebody else tried
-- to register learns nothing at all. This file closes both.
--
--
-- WHAT THIS ADDS
--   user_badges.check_reason   why the last check did not verify -- OWNER-READABLE
--   email_outbox               durable queue for mail the database wants sent
--   cslb_apply_check           rewritten: records check_reason, raises the alert
--   notify_license_decision    notification on verified / rejected / revoked
--
--
-- WHY check_reason IS A COLUMN ON user_badges AND NOT A READ OF THE AUDIT TRAIL
--
-- The reason already exists, on user_badge_reviews. The contractor cannot read
-- it and must not be able to: that table carries the reviewer's private notes,
-- the CSLB record we consulted, and -- since 20260921140000 --
-- conflicting_profile_id, which names the other account in a claim dispute.
-- Loosening its RLS to expose one column would expose all of them.
--
-- So the reason is denormalised onto the badge, which its owner can already
-- read. This is not the two-writers trap: cslb_apply_check is the only writer
-- of check_reason, exactly as it is the only automated writer of status, and
-- the review row remains the immutable history while the column is current
-- state. The admin panel clears it on a manual decision, where rejection_reason
-- becomes the thing the user reads instead.
--
--
-- WHY AN OUTBOX AND NOT A CALL TO RESEND
--
-- Postgres cannot call Resend, and the three paths that detect a stolen claim
-- all run somewhere a server route does not:
--
--   - a new C-10 signing up          -> handle_new_user(), inside the auth insert
--   - a contractor editing a number  -> a browser write to role_credentials
--   - the weekly import sweep        -> the script, holding the service role
--
-- The browser cannot be trusted to raise this alarm, because on the first two
-- paths the browser belongs to the person the alarm is about. So the database
-- writes a row and something else sends it.
--
-- THE ROW IS WRITTEN IN THE SAME TRANSACTION AS THE BLOCKED CLAIM, which is the
-- property that matters: the alert cannot be lost because an HTTP call failed
-- at the wrong moment, and it survives Resend being down, a bad key and a
-- deploy. Sending is a separate, retryable step in app/api/email/drain.
--
-- The alternative considered and rejected was pg_net posting straight from the
-- trigger. It is the usual Supabase answer and it is faster, but it is
-- fire-and-forget -- no retry, no record, failures landing in a table nobody
-- reads -- and it needs a new extension plus the site URL and a secret stored
-- in the database. An outbox is one table and leaves the drain mechanism free
-- to change later without touching anything that writes to it.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. check_reason -- the owner-readable half of the decision
--
-- Same vocabulary as user_badge_reviews.reason, and deliberately the same
-- CHECK, so a reason cannot exist in one place and be unrenderable in the
-- other. NULL means either "verified" or "a human decided this", and the two
-- are told apart by status.
-- -----------------------------------------------------------------------------

alter table public.user_badges
  add column if not exists check_reason text;

alter table public.user_badges
  drop constraint if exists user_badges_check_reason_ck;

alter table public.user_badges
  add constraint user_badges_check_reason_ck
    check (
      check_reason is null
      or check_reason in (
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

comment on column public.user_badges.check_reason is
  'Why the last automated check did not verify this badge. Denormalised from '
  'user_badge_reviews.reason so the badge OWNER can read it -- that table is '
  'admin-only because it carries private notes and, since 20260921140000, the '
  'other party in a claim dispute. Written only by cslb_apply_check(), cleared '
  'by the admin panel on a manual decision.';

-- NOT in public_badges, and that is the point of mentioning it here. The view
-- is what other users read; why somebody's licence failed to verify is between
-- them and us.


-- -----------------------------------------------------------------------------
-- 2. email_outbox
--
-- template + payload rather than rendered HTML. Three reasons: the database
-- does not build markup, a template fix reaches mail that has not gone out yet,
-- and the table does not carry a kilobyte of inlined CSS per row.
--
-- NOT READABLE FROM THE BROWSER AT ALL. It holds email addresses next to the
-- reason each one is being written to. RLS on with no policies, revoked from
-- anon and authenticated; the drain route reads it with the service role.
-- -----------------------------------------------------------------------------

create table if not exists public.email_outbox (
  id          uuid        primary key default gen_random_uuid(),
  to_email    text        not null,
  subject     text        not null,
  template    text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer     not null default 0,
  last_error  text,

  constraint email_outbox_to_email_ck
    check (btrim(to_email) <> '')
);

-- The drain's only query. Partial, because a sent row is never looked at again
-- and the unsent set is normally empty.
create index if not exists email_outbox_unsent_idx
  on public.email_outbox (created_at)
  where sent_at is null;

comment on table public.email_outbox is
  'Mail the database decided to send, queued in the same transaction as the '
  'event that caused it. Drained by app/api/email/drain. Postgres cannot call '
  'Resend, and the paths that raise these alerts have no server route to hang '
  'the call on -- see the header of 20260921150000.';

comment on column public.email_outbox.attempts is
  'Incremented by the drain on every try, sent or not. A row with a high '
  'attempts count and a last_error is a delivery that keeps failing, which is '
  'the thing worth looking at.';

alter table public.email_outbox enable row level security;

revoke all on public.email_outbox from anon, authenticated;
grant all  on public.email_outbox to service_role;


-- -----------------------------------------------------------------------------
-- 3. cslb_apply_check -- records the reason, raises the alert
--
-- Replaced whole, signature unchanged. Everything that is NOT changing and is
-- easy to lose in a rewrite, restated so a reader can check it against the
-- code below:
--
--   - revoked is never touched, on either path
--   - rejected is left alone unless the credential itself changed
--   - a verified badge is never knocked back by stale_data, nor by not_found
--     on a badge a human approved
--   - nothing is written at all when status, expiry and reason match last time
--   - already_claimed and name_mismatch DO knock a verified badge back
--
-- What is new: check_reason on the badge, and the notification plus outbox row
-- when a claim is blocked.
--
--
-- THE ALERT FIRES ONCE PER CONFLICT, NOT ONCE PER IMPORT.
--
-- Two guards, and both are needed:
--
--   1. The existing "nothing changed" early return. A standing conflict
--      re-evaluated by next week's sweep produces no write and therefore no
--      alert, because status, expiry and reason are all identical.
--   2. A seven-day window on the same (badge, other account) pair. This one
--      exists for the case guard 1 does not cover: somebody editing their
--      licence number back and forth, which is a real change every time and
--      would otherwise let one person mail another on demand.
--
-- The check has to run BEFORE the new review row is inserted, or it finds the
-- row it is asking about.
--
--
-- THE ALERT NAMES NOBODY. The holder is told their licence was entered on
-- another account and nothing more. A claim is far more often a typo than a
-- theft, and naming the other party turns our mistake-handling into an
-- accusation delivered by email. The admin queue has both accounts; that is
-- where a human decides.
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
  already_warned boolean;
  holder_email   text;
  holder_name    text;
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

  -- BEFORE the new review row goes in, or this finds it.
  already_warned := false;

  if ev.reason = 'already_claimed' and ev.claimed_by is not null then
    select exists (
      select 1
      from public.user_badge_reviews r
      where r.user_badge_id = badge_id
        and r.reason = 'already_claimed'
        and r.conflicting_profile_id = ev.claimed_by
        and r.reviewed_at > now() - interval '7 days'
    ) into already_warned;
  end if;

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

  -- -------------------------------------------------------------------------
  -- The security alert, to the account that actually holds the licence.
  -- -------------------------------------------------------------------------
  if ev.reason = 'already_claimed'
     and ev.claimed_by is not null
     and not already_warned then

    insert into public.notifications (user_id, type, title, message, link)
    values (
      ev.claimed_by,
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
    where p.id = ev.claimed_by;

    -- No address, no row. An outbox entry that can never be delivered is a
    -- permanent failure the drain would retry for ever.
    if nullif(btrim(coalesce(holder_email, '')), '') is not null then
      insert into public.email_outbox (to_email, subject, template, payload)
      values (
        holder_email,
        'Someone entered your contractor licence number',
        'license_claim_attempt',
        jsonb_build_object(
          'full_name', holder_name,
          'license_number', ev.checked_identifier
        )
      );
    end if;
  end if;

  return case
    when ev.reason is null then 'verified'
    else 'review:' || ev.reason
  end;
end;
$$;

comment on function public.cslb_apply_check(uuid, text, text, boolean) is
  'Runs cslb_evaluate_license() for one profile and writes the badge, its '
  'check_reason and an audit row. On a newly blocked already_claimed it also '
  'notifies and emails the account that holds the licence -- once per conflict '
  'per week, naming nobody.';


-- -----------------------------------------------------------------------------
-- 4. Telling the contractor a decision was made
--
-- A TRIGGER RATHER THAN TWO INSERTS IN THE ADMIN PANEL, for the same reason
-- every other rule in this feature is a trigger: it then covers the automated
-- verification at signup and the transfer-revocation in the admin panel as well
-- as the two the request was about, and no future writer can forget it.
--
-- WHICH TRANSITIONS NOTIFY, and which deliberately do not:
--
--   verified  -- yes. Good news, and the same sentence whether a human or the
--                import decided it.
--   rejected  -- yes, carrying rejection_reason, which is the whole reason that
--                column is mandatory on a rejection.
--   revoked   -- yes. Losing a verification without being told is the worst of
--                the four.
--   pending   -- NO. A sweep moving somebody back to review is already visible
--                on their profile with a reason and an instruction, and
--                notifying on it would put a message in the bell every time a
--                weekly import found the same unchanged problem.
--
-- INSERT is handled as well as UPDATE. The first check on an account can create
-- the badge already verified, in which case there is no UPDATE to fire on.
-- -----------------------------------------------------------------------------

create or replace function public.notify_license_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires_on date;
begin
  if new.badge_key <> 'license_verified' then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
  end if;

  if new.status = 'verified' then
    -- expires_at is the day AFTER the printed CSLB date -- see cslb_apply_check
    -- -- so the date to show a human is one day back from it.
    expires_on := (new.expires_at - interval '1 day')::date;

    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.profile_id,
      'license_verified',
      'Your licence is verified',
      'We checked your C-10 licence against the CSLB register. The verified '
      || 'check mark now appears beside your name.'
      || coalesce(
           ' It follows your licence and expires on '
           || to_char(expires_on, 'FMDD FMMonth YYYY') || '.',
           ''
         ),
      '/dashboard/profile'
    );

  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.profile_id,
      'license_rejected',
      'Licence verification not approved',
      coalesce(
        new.rejection_reason,
        'We could not verify this licence. Check the number on your profile.'
      ),
      '/dashboard/profile'
    );

  elsif new.status = 'revoked' then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.profile_id,
      'license_revoked',
      'Your licence verification was removed',
      'The verified check mark has been removed from your account. If you '
      || 'think this is a mistake, contact us and we will look at it again.',
      '/dashboard/profile'
    );
  end if;

  return null;
end;
$$;

comment on function public.notify_license_decision() is
  'Notifies the badge owner when a licence verification is granted, refused or '
  'removed. Deliberately silent on a move back to pending: the profile already '
  'shows the reason, and a weekly sweep finding the same unchanged problem '
  'must not put a message in the bell every week.';

drop trigger if exists user_badges_notify_license_decision on public.user_badges;

create trigger user_badges_notify_license_decision
  after insert or update on public.user_badges
  for each row execute function public.notify_license_decision();


-- -----------------------------------------------------------------------------
-- 5. Backfill check_reason for badges already in the queue
--
-- REQUIRED, not tidying. 20260921140000 runs its ownership sweep before this
-- file exists, so every badge it sent back to review has its reason recorded on
-- the audit row and nothing on the badge. Without this backfill those
-- contractors would open their profile the moment section 1 ships and see a
-- badge that is simply not awarded, with no explanation -- which is the exact
-- state this migration exists to end, reproduced on the population that needs
-- it most.
--
-- distinct on (user_badge_id) ... order by reviewed_at desc is the newest
-- review per badge. Only pending badges, and only where the column is still
-- empty, so this can be re-run and cannot overwrite anything cslb_apply_check
-- has since written.
-- -----------------------------------------------------------------------------

update public.user_badges ub
   set check_reason = latest.reason
  from (
    select distinct on (r.user_badge_id) r.user_badge_id, r.reason
    from public.user_badge_reviews r
    order by r.user_badge_id, r.reviewed_at desc
  ) latest
 where latest.user_badge_id = ub.id
   and latest.reason is not null
   and ub.badge_key = 'license_verified'
   and ub.status = 'pending'
   and ub.check_reason is null;
