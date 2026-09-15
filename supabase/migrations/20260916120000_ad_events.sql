-- =============================================================================
-- ad_events: impression and click capture
--
-- STATUS: NOT YET APPLIED. Staging first — see the loop in CLAUDE.md, and run
-- `npm run db:linked` before every push.
--
-- Capture only. NOTHING READS THIS. There is no reporting UI, no rollup, and
-- no brand-facing number anywhere in the app. It exists so that when reporting
-- is built there is history to report on, rather than a counter starting from
-- the day someone gets round to it.
--
-- Spec section 4.6 cut `advertisement_metrics_daily` on the grounds that a
-- rollup table with no writer reports zero. This is the writer, and it is
-- deliberately NOT the rollup: one row per event, raw, so that whatever
-- aggregation turns out to be wanted can be computed later. The daily rollup
-- is still the right shape for reporting — build it over this, on a schedule,
-- and do not have a dashboard scan this table directly once it is large.
--
-- Written by lib/adEvents.tsx from the browser. Impressions are batched;
-- clicks flush immediately.
-- =============================================================================


create table if not exists public.ad_events (
  id uuid primary key default gen_random_uuid(),

  -- CASCADE, matching the admin delete in hooks/useAds.tsx, which hard-deletes
  -- the listing. The alternative is orphaned events that no longer join to
  -- anything, or an FK error that makes an ad undeletable. Worth knowing when
  -- reporting is built: deleting an ad destroys its history with it.
  advertisement_id uuid not null
    references public.sponsored_listings(id) on delete cascade,

  event_type text not null,

  -- Server clock, never the client's. A timestamp supplied by the browser is
  -- both forgeable and routinely wrong by minutes.
  occurred_at timestamptz not null default now(),

  -- Filled by the DATABASE from the JWT, not sent by the client — see the
  -- policy below. NULL for a logged-out viewer.
  --
  -- ON DELETE SET NULL rather than CASCADE: if a profile is removed, the
  -- impression still happened and still counts toward what a brand was
  -- delivered. It just becomes anonymous.
  viewer_id uuid
    default auth.uid()
    references public.profiles(id) on delete set null,

  constraint ad_events_event_type_check
    check (event_type in ('impression', 'click'))
);

comment on table public.ad_events is
  'Raw impression and click log for sponsored_listings, written from the '
  'browser by lib/adEvents.tsx. Capture only — nothing reads it yet. Build the '
  'daily rollup over this rather than querying it directly from a dashboard.';

comment on column public.ad_events.viewer_id is
  'Defaulted from auth.uid() by the database and constrained to it by RLS, so '
  'a caller cannot attribute an event to another user. NULL for logged-out '
  'viewers — which is currently unreachable, since ads only render on '
  '/dashboard pages, but the column is honest about the case.';


-- -----------------------------------------------------------------------------
-- Index
--
-- The query reporting will want is "events for this ad, over this window",
-- which is exactly this. Deliberately only one: the table takes a write on
-- every ad render and every click, and each extra index is a cost paid on all
-- of them to serve a query nobody has written yet.
-- -----------------------------------------------------------------------------

create index if not exists ad_events_advertisement_occurred_idx
  on public.ad_events (advertisement_id, occurred_at desc);


-- -----------------------------------------------------------------------------
-- RLS
--
-- Insert is open to anon and authenticated, because an impression is logged by
-- whoever is looking at the page and logged-out viewers are in scope for the
-- column above.
--
-- The `with check` is what makes that safe to the extent it can be: viewer_id
-- must be NULL or the caller's own id, so this cannot be used to write events
-- against somebody else's account. The column default means the client never
-- sends it at all; the policy is there for the caller that tries anyway.
--
-- WHAT THIS DOES NOT PREVENT: a signed-in user, or anyone with the anon key,
-- inflating the count for an ad by posting the same event repeatedly. That is
-- inherent in client-side ad metrics and is not solved by moving the write to
-- a route handler — a public endpoint is equally postable. It is worth naming
-- rather than pretending otherwise: these numbers are good enough to tell a
-- brand roughly what it got, and must not become the basis for per-impression
-- billing without server-side verification. Pricing is flat monthly today,
-- which is why this is acceptable now.
--
-- There is no UPDATE and no DELETE policy, so events are append-only to
-- everyone including admins. SELECT is admin-only: nothing in the app reads
-- this, and a brand must not be able to read another brand's traffic.
-- -----------------------------------------------------------------------------

alter table public.ad_events enable row level security;

drop policy if exists "Anyone can log ad events" on public.ad_events;
create policy "Anyone can log ad events"
  on public.ad_events for insert
  to anon, authenticated
  with check (viewer_id is null or viewer_id = (select auth.uid()));

drop policy if exists "Admins can read ad events" on public.ad_events;
create policy "Admins can read ad events"
  on public.ad_events for select
  to authenticated
  using (public.is_admin());
