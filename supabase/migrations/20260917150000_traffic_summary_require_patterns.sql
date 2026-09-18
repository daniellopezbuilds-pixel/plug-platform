-- ============================================================================
-- traffic_summary(): make the exclusion list mandatory
-- ============================================================================
--
-- 20260917140000 gave the parameter `default array[]::text[]`. That was a
-- mistake, and it cost a morning: a caller that does not pass the list — an old
-- deployment of app/api/cron/daily-summary, a hand-run query, a JSON body where
-- the key serialised to undefined and vanished — resolved the default, returned
-- completely unfiltered numbers, and reported success. Demo and internal
-- accounts stayed in the count and there was nothing anywhere to say why.
--
-- The two states it could not tell apart:
--
--   "the caller did not send a list"     -> should be an error
--   "the caller sent an empty list"      -> legitimately excludes nothing
--
-- Removing the default separates them. A call with no argument now fails to
-- resolve at all: PostgREST cannot find a zero-argument traffic_summary, the
-- route gets an error and returns 500, and the failure is visible in the Vercel
-- log the same morning. An explicitly empty array still means "exclude
-- nothing", which stays available for a deliberate unfiltered read.
--
-- CONSEQUENCE WORTH STATING: until a deployment that passes the list is live,
-- the daily email will ERROR rather than send. That is the intended trade. A
-- summary that does not arrive gets chased; one that arrives with inflated
-- numbers gets believed and quoted.
--
-- DROP then CREATE rather than CREATE OR REPLACE: the argument types are
-- unchanged, so a replace would work, but dropping makes it impossible for a
-- stale definition to survive and takes the old GRANT with it, which is
-- re-issued below. Nothing else about the body changes.
-- ============================================================================

drop function if exists public.traffic_summary(text[]);

create function public.traffic_summary(excluded_email_patterns text[])
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

  -- Profiles matching any pattern, case-insensitively on both sides.
  --
  -- coalesce is kept for a NULL array, which is a different thing from an
  -- absent argument: `traffic_summary(null)` is an explicit call and should
  -- behave like an empty list rather than erroring mid-query.
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

  -- A session is excluded if ANY view in it is attributable to an excluded
  -- account. A team member arrives logged out, so the early rows of their
  -- session carry no viewer_id and only the ones after sign-in are
  -- attributable; filtering row by row would drop part of their traffic and
  -- leave the rest counted as a stranger.
  --
  -- STILL NOT VISIBLE: a session that never signs in has no viewer_id on any
  -- row and cannot be told from a real visitor. The email says so.
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

    -- Diagnostics, logged by the route. A zero here after adding a pattern
    -- means the pattern is wrong and the numbers are unchanged.
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
  'least one view attributable to one of them. The parameter is MANDATORY and '
  'deliberately has no default: an absent list used to resolve to "exclude '
  'nothing" and return unfiltered numbers that looked correct. Patterns come '
  'from lib/internalAccounts.tsx. Day boundaries are America/Los_Angeles.';

revoke all on function public.traffic_summary(text[]) from public;
revoke all on function public.traffic_summary(text[]) from anon;
revoke all on function public.traffic_summary(text[]) from authenticated;
grant execute on function public.traffic_summary(text[]) to service_role;
