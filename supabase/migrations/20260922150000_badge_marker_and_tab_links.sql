-- =============================================================================
-- The name marker, and where a licence notification lands
--
-- Two small changes serving two bits of UI:
--
--   1. public_badges gains icon and label, so the marker beside a name can be
--      the badge's own glyph and can say what it actually verified.
--   2. The licence notifications link to the Credentials tab of the profile
--      editor rather than to the top of the page.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. public_badges -- icon and label
--
-- The mark beside a name is becoming the shield-check glyph instead of a bare
-- tick, and its tooltip is becoming "C-10 licence verified" instead of
-- "Verified". Both of those are per-badge facts that already exist on
-- public.badges; the view simply was not carrying them.
--
-- WHY THE VIEW AND NOT A SECOND QUERY. useProfileBadges batches every name on
-- a page into ONE `in` query against this view -- twenty names on the feed
-- produce one request. Joining badges client-side would either add a second
-- round trip or push a catalog fetch into a hook whose whole purpose is to
-- avoid one. Two columns on a view that is already being read cost nothing.
--
-- STILL NOTHING PRIVATE. badges is the public catalog of what a badge IS --
-- key, label, description, icon -- not who holds one. The view's existing
-- guarantee is unchanged: currently-valid badges on active badge types, no
-- licence numbers, no rejection reasons.
--
-- Appended, not inserted. `create or replace view` may add columns at the end
-- and may not reorder or retype the ones already there, so the five existing
-- columns stay exactly where they are and anything selecting by name is
-- unaffected.
-- -----------------------------------------------------------------------------

create or replace view public.public_badges as
select
  ub.profile_id,
  ub.badge_key,
  ub.awarded_at,
  ub.expires_at,
  b.category,
  b.icon,
  b.label
from public.user_badges ub
join public.badges b on b.key = ub.badge_key
where b.active
  and ub.status = 'verified'
  and (ub.expires_at is null or ub.expires_at > now());

alter view public.public_badges set (security_invoker = off);

comment on view public.public_badges is
  'Currently-valid badges, readable by any authenticated user. The single '
  'definition of "still verified": status = verified and expires_at in the '
  'future or null. Carries the badge catalog''s icon and label so the marker '
  'beside a name can be drawn and described from one query. security_invoker '
  'is off deliberately so this can be read without exposing user_badges, which '
  'holds licence numbers. Expect the Supabase advisor to flag it.';


-- -----------------------------------------------------------------------------
-- 2. Licence notifications land on the Credentials tab
--
-- /dashboard/profile is four tabs now. A notification about a licence that
-- drops somebody at the top of the Profile tab has told them something is
-- wrong and left them to find where.
--
--   license_claim_attempt  -> credentials. Their licence number is the subject
--                             of the alert and the thing they may want to check.
--   license_rejected       -> credentials. The number is what needs correcting.
--   license_revoked        -> credentials. Same.
--   license_verified       -> badges. Nothing to edit; the badge is the news.
--
-- Both functions are replaced whole, signatures unchanged, because a function
-- is replaced whole. Nothing else in either changes -- notify_license_decision
-- keeps its deliberate silence on a move back to pending, and
-- cslb_raise_claim_alert keeps owning the once-per-week dedupe.
--
-- EXISTING NOTIFICATION ROWS ARE NOT REWRITTEN. notifications.link is a
-- record of where a message pointed when it was sent, and an old row still
-- lands on a working page -- the profile editor opens on the Profile tab when
-- the query string says nothing. Rewriting history to improve a link is a
-- worse trade than a slightly less direct old notification.
-- -----------------------------------------------------------------------------

create or replace function public.cslb_raise_claim_alert(
  p_holder_id  uuid,
  p_license    text
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

  -- The dedupe reads the NOTIFICATION, which is the thing being deduped, and
  -- not a review row. That distinction is the whole of 20260921160000: a
  -- review row and an alert are different events, and deduping one on the
  -- other suppressed every first real alert.
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
    '/dashboard/profile?tab=credentials'
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
  'Notifies and emails the holder of a licence somebody else tried to claim, '
  'at most once in seven days. Owns the dedupe so the sweep and the backfill '
  'share one copy of the rule. Links to the Credentials tab of the profile '
  'editor.';


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

  -- tg_op guard included: the trigger fires on INSERT as well, where OLD does
  -- not exist. Reproduced exactly as 20260921150000 wrote it.
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
      '/dashboard/profile?tab=badges'
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
      '/dashboard/profile?tab=credentials'
    );

  elsif new.status = 'revoked' then
    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.profile_id,
      'license_revoked',
      'Your licence verification was removed',
      'The verified check mark has been removed from your account. If you '
      || 'think this is a mistake, contact us and we will look at it again.',
      '/dashboard/profile?tab=credentials'
    );
  end if;

  return null;
end;
$$;

comment on function public.notify_license_decision() is
  'Notifies the badge owner when a licence verification is granted, refused or '
  'removed. Deliberately silent on a move back to pending: the profile already '
  'shows the reason, and a weekly sweep finding the same unchanged problem '
  'must not become a weekly notification. Granted links to the Badges tab; the '
  'other two link to Credentials, where the number is edited.';
