-- ============================================================================
-- page_views -- first-party traffic capture, and the summary the daily email
-- reads.
-- ============================================================================
--
-- Deliberately modelled on ad_events (20260916120000): same shape, same RLS
-- posture, same reasoning about what a client-written metric is and is not
-- worth. Read that file's RLS comment before changing this one.
--
-- WHY FIRST-PARTY AND NOT AN ANALYTICS SERVICE. Cost, and the fact that this
-- table is three columns and a count. It buys rough visit and signup numbers
-- for a daily email, not a product analytics suite -- there is no funnel, no
-- retention, no attribution, and adding them here would be the point at which
-- a real tool becomes cheaper than this one.
-- ============================================================================

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),

  -- Pathname only. The client never sends the query string, and it should stay
  -- that way: ?returnTo=, ?checkout=, and anything a future page adds can carry
  -- information about an individual that a traffic count has no business
  -- keeping.
  path text not null,

  -- Filled by the DATABASE from the JWT, never sent by the client -- same
  -- pattern and same reason as ad_events.viewer_id. NULL for a logged-out
  -- visitor, which here is the common case rather than a theoretical one:
  -- /, /login and /signup are all tracked.
  --
  -- ON DELETE SET NULL, not CASCADE: the visit still happened after the account
  -- is gone. It just stops being attributable.
  viewer_id uuid
    default auth.uid()
    references public.profiles(id) on delete set null,

  -- A random id held in sessionStorage, so a "visit" is one browser session
  -- rather than one page load. sessionStorage and not localStorage on purpose:
  -- it dies with the tab, which is roughly what a visit is, and it never
  -- becomes a durable cross-visit identifier for a logged-out person.
  --
  -- NOT unique and NOT a foreign key -- it is a grouping key supplied by an
  -- untrusted client. Two visitors could in principle collide or one could
  -- forge another's; see the RLS note below on what these numbers are for.
  session_id text not null,

  -- Server clock, never the client's.
  created_at timestamptz not null default now()
);

comment on table public.page_views is
  'Raw page-view log written from the browser by lib/pageViews.tsx. Read only '
  'by public.traffic_summary() for the daily email. Counts of distinct '
  'session_id are "visits"; counts of rows are page loads.';


-- -----------------------------------------------------------------------------
-- Index
--
-- Every query against this table is "rows in a time window", because that is
-- what traffic_summary() does and nothing else reads it. One index, matching
-- that, on a table that takes a write on every navigation.
-- -----------------------------------------------------------------------------

create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);


-- -----------------------------------------------------------------------------
-- RLS
--
-- Insert open to anon and authenticated: the whole point is to count logged-out
-- visitors on /, /login and /signup, and they hold nothing but the anon key.
--
-- The `with check` limits what that buys -- viewer_id must be NULL or the
-- caller's own id, so nobody can write views against another account. The
-- column default means the client never sends it; the policy is for the caller
-- that tries anyway.
--
-- WHAT THIS DOES NOT PREVENT, stated plainly: anyone holding the anon key --
-- which is everyone -- can post page_views and inflate these numbers. That is
-- inherent in client-side analytics and moving the write to a route handler
-- would not change it, because a public endpoint is equally postable. These
-- are a morning temperature check, not a metric to bill or report externally
-- from.
--
-- SELECT is admin-only and there is no UPDATE or DELETE policy at all. Traffic
-- data is not readable by ordinary users: who visited what is exactly the sort
-- of thing that should not leak sideways between accounts. The daily email
-- reads it through traffic_summary() under service_role, which bypasses RLS.
-- -----------------------------------------------------------------------------

alter table public.page_views enable row level security;

drop policy if exists "Anyone can log a page view" on public.page_views;
create policy "Anyone can log a page view"
  on public.page_views for insert
  to anon, authenticated
  with check (viewer_id is null or viewer_id = (select auth.uid()));

drop policy if exists "Admins can read page views" on public.page_views;
create policy "Admins can read page views"
  on public.page_views for select
  to authenticated
  using (public.is_admin());


-- -----------------------------------------------------------------------------
-- traffic_summary()
--
-- Everything the daily email needs, in one row.
--
-- WHY THIS IS A FUNCTION AND NOT QUERIES IN THE ROUTE. Two reasons, both about
-- correctness rather than tidiness:
--
--   1. DAY BOUNDARIES ARE PACIFIC, NOT UTC. The email says "yesterday", and
--      yesterday has to mean the calendar day Daniel just lived through. Doing
--      that in JavaScript means hand-rolling zone offsets and getting the two
--      daylight-saving transitions right; Postgres already knows. `at time
--      zone` on a naive timestamp yields the UTC instant of that local wall
--      time, which is exactly the boundary wanted.
--
--   2. COUNT(DISTINCT session_id) cannot be expressed through PostgREST, so
--      the alternative is fetching every session id for the window and
--      de-duplicating in the route -- unbounded transfer that grows with
--      traffic, to compute a number Postgres can return as an integer.
--
-- SECURITY DEFINER with EXECUTE revoked from anon and authenticated: this
-- reads a table those roles must not see, so the function must not become a way
-- around the SELECT policy above.
-- -----------------------------------------------------------------------------

create or replace function public.traffic_summary()
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
      -- Naive local timestamps converted back to absolute instants. Postgres
      -- applies the offset in force on each date, so these stay correct across
      -- both DST transitions.
      ((today_start - interval '1 day') at time zone 'America/Los_Angeles') as y_start,
      ( today_start                     at time zone 'America/Los_Angeles') as y_end,
      ((today_start - interval '2 days') at time zone 'America/Los_Angeles') as y2_start,
      ((today_start - interval '1 day') at time zone 'America/Los_Angeles') as y2_end,
      ( month_start                     at time zone 'America/Los_Angeles') as month_start
    from local_bounds
  )
  select jsonb_build_object(
    'visits_yesterday', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.y_start and pv.created_at < b.y_end
    ),
    'visits_day_before', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.y2_start and pv.created_at < b.y2_end
    ),
    'views_yesterday', (
      select count(*)
      from public.page_views pv, b
      where pv.created_at >= b.y_start and pv.created_at < b.y_end
    ),
    'visits_month', (
      select count(distinct pv.session_id)
      from public.page_views pv, b
      where pv.created_at >= b.month_start
    ),
    'new_users_yesterday', (
      select count(*)
      from public.profiles p, b
      where p.created_at >= b.y_start and p.created_at < b.y_end
    ),
    -- Breakdown by signup type. coalesce to 'unknown' rather than dropping the
    -- row: accounts predating the signup form, and Google accounts that have
    -- not finished onboarding, both have a NULL signup_type and both are still
    -- new users.
    'new_users_by_type', (
      select coalesce(jsonb_object_agg(t.signup_type, t.n), '{}'::jsonb)
      from (
        select coalesce(p.signup_type, 'unknown') as signup_type, count(*) as n
        from public.profiles p, b
        where p.created_at >= b.y_start and p.created_at < b.y_end
        group by 1
      ) t
    ),
    'new_users_month', (
      select count(*)
      from public.profiles p, b
      where p.created_at >= b.month_start
    ),
    'users_total', (select count(*) from public.profiles),
    -- Echoed back so the email can print the window it actually describes,
    -- rather than the route re-deriving a date and the two disagreeing.
    'yesterday_label', (
      select to_char(today_start - interval '1 day', 'FMDay FMDD FMMonth YYYY')
      from local_bounds
    ),
    'month_label', (
      select to_char(month_start, 'FMMonth YYYY') from local_bounds
    )
  );
$$;

comment on function public.traffic_summary() is
  'Every number the daily summary email prints, in one row. Day boundaries are '
  'America/Los_Angeles. SECURITY DEFINER because it reads page_views, which is '
  'admin-only; EXECUTE is revoked from anon and authenticated so it cannot be '
  'used to read around that policy.';

revoke all on function public.traffic_summary() from public;
revoke all on function public.traffic_summary() from anon;
revoke all on function public.traffic_summary() from authenticated;
grant execute on function public.traffic_summary() to service_role;
