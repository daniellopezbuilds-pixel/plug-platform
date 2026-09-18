-- ============================================================================
-- traffic_summary(): exclude demo and internal accounts
-- ============================================================================
--
-- The daily email should count external signups and external visitors. Seeded
-- demo profiles and the team's own logins are neither, and at current volume
-- they dominate: six demo accounts against a handful of real ones makes the
-- morning number read as growth that did not happen.
--
-- THE LIST IS NOT IN THIS FILE. It is passed in as a parameter from
-- lib/internalAccounts.tsx, so adding a colleague is a one-line code change and
-- a deploy rather than a migration, a db push to two projects and a link-back.
-- The patterns arrive as a text[] bind parameter and are never interpolated
-- into SQL.
--
-- Replacing rather than overloading: `create or replace` with a different
-- signature would leave the old zero-argument version in place alongside the
-- new one, and PostgREST would happily keep calling it. Dropped explicitly.
-- ============================================================================

drop function if exists public.traffic_summary();

create or replace function public.traffic_summary(
  excluded_email_patterns text[] default array[]::text[]
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with local_bounds as (
    select
      date_trunc('day',   (now() at time zone 'America/Los_Angeles')) as today_start,
      date_trunc('month', (now() at time zone 'America/Los_Angeles')) as month_start
  ),
  b as (
    select
      ((today_start - interval '1 day')  at time zone 'America/Los_Angeles') as y_start,
      ( today_start                      at time zone 'America/Los_Angeles') as y_end,
      ((today_start - interval '2 days') at time zone 'America/Los_Angeles') as y2_start,
      ((today_start - interval '1 day')  at time zone 'America/Los_Angeles') as y2_end,
      ( month_start                      at time zone 'America/Los_Angeles') as month_start
    from local_bounds
  ),

  -- Profiles matching any pattern. `lower()` both sides: email case varies, and
  -- the caller should not have to remember to normalise.
  excluded_profiles as (
    select p.id
    from public.profiles p
    where p.email is not null
      and exists (
        select 1
        from unnest(coalesce(excluded_email_patterns, array[]::text[])) as pat
        where lower(p.email) like lower(pat)
      )
  ),

  -- Sessions to drop from the visit counts.
  --
  -- A SESSION IS EXCLUDED IF *ANY* VIEW IN IT IS ATTRIBUTABLE TO AN EXCLUDED
  -- ACCOUNT, not just the views that carry the id. A team member arrives logged
  -- out, so the first few rows of their session have viewer_id NULL and only
  -- the ones after sign-in are attributable; filtering row by row would drop
  -- part of their traffic and leave the rest counted as a stranger. Keying on
  -- the session makes one identified view disqualify the whole visit.
  --
  -- WHAT THIS STILL CANNOT SEE, and it is not a small gap: a session that never
  -- signs in has no viewer_id on any row and is indistinguishable from a real
  -- visitor. Someone on the team reading /login without logging in, or opening
  -- the site in a private window, is counted as a visit. There is no honest fix
  -- from this table — the only identifier a logged-out browser supplies is the
  -- session id it generated itself. The email says so rather than implying the
  -- visit number is clean.
  excluded_sessions as (
    select distinct pv.session_id
    from public.page_views pv
    join excluded_profiles e on e.id = pv.viewer_id
  )

  select jsonb_build_object(
    'visits_yesterday', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.y_start and pv.created_at < b.y_end
        and pv.session_id not in (select session_id from excluded_sessions)
    ),
    'visits_day_before', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.y2_start and pv.created_at < b.y2_end
        and pv.session_id not in (select session_id from excluded_sessions)
    ),
    'views_yesterday', (
      select count(*)
      from public.page_views pv, b
      where pv.created_at >= b.y_start and pv.created_at < b.y_end
        and pv.session_id not in (select session_id from excluded_sessions)
    ),
    'visits_month', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.month_start
        and pv.session_id not in (select session_id from excluded_sessions)
    ),
    'new_users_yesterday', (
      select count(*)
      from public.profiles p, b
      where p.created_at >= b.y_start and p.created_at < b.y_end
        and p.id not in (select id from excluded_profiles)
    ),
    'new_users_by_type', (
      select coalesce(jsonb_object_agg(t.signup_type, t.n), '{}'::jsonb)
      from (
        select coalesce(p.signup_type, 'unknown') as signup_type, count(*) as n
        from public.profiles p, b
        where p.created_at >= b.y_start and p.created_at < b.y_end
          and p.id not in (select id from excluded_profiles)
        group by 1
      ) t
    ),
    'new_users_month', (
      select count(*)
      from public.profiles p, b
      where p.created_at >= b.month_start
        and p.id not in (select id from excluded_profiles)
    ),
    'users_total', (
      select count(*)
      from public.profiles p
      where p.id not in (select id from excluded_profiles)
    ),

    -- Diagnostics. Not printed in the email; logged by the route so "the filter
    -- silently matched nothing" is visible without opening a SQL console. A
    -- zero here after adding a pattern means the pattern is wrong.
    'excluded_profiles', (select count(*) from excluded_profiles),
    'excluded_sessions_month', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.month_start
        and pv.session_id in (select session_id from excluded_sessions)
    ),

    'yesterday_label', (
      select to_char(today_start - interval '1 day', 'FMDay FMDD FMMonth YYYY')
      from local_bounds
    ),
    'month_label', (
      select to_char(month_start, 'FMMonth YYYY') from local_bounds
    )
  );
$$;

comment on function public.traffic_summary(text[]) is
  'Every number the daily summary email prints, in one row, excluding profiles '
  'whose email matches any supplied LIKE pattern and any visit session with at '
  'least one view attributable to one of them. Patterns come from '
  'lib/internalAccounts.tsx. Day boundaries are America/Los_Angeles. A '
  'logged-out session belonging to the team cannot be identified and is still '
  'counted as a visit.';

revoke all on function public.traffic_summary(text[]) from public;
revoke all on function public.traffic_summary(text[]) from anon;
revoke all on function public.traffic_summary(text[]) from authenticated;
grant execute on function public.traffic_summary(text[]) to service_role;
