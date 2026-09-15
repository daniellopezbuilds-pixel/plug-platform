-- =============================================================================
-- Ad payments: duration_months and stripe_session_id on sponsored_listings
--
-- Supports the flat monthly placement pricing built in:
--   scripts/create-ad-prices.mjs        Stripe Products and Prices (test mode)
--   lib/adPricing.tsx                   rates, durations, end-date arithmetic
--   lib/adCapacity.tsx                  placement inventory
--   app/api/stripe/checkout/ad/         creates the row and the Checkout Session
--   app/api/stripe/webhook/             marks it paid
--
-- STATUS: NOT YET APPLIED. Run against staging first — see the loop in
-- CLAUDE.md, and run `npm run db:linked` before every push.
--
-- Fully additive. Both columns are nullable with no default, so every existing
-- row keeps working untouched: house ads, job ads and the free
-- /dashboard/requests submissions have no duration and no Stripe session, and
-- NULL is the honest value for all of them rather than a fabricated one.
--
-- Nothing is needed for payment_status or status. The baseline already
-- CHECK-constrains payment_status to ('n/a', 'unpaid', 'paid') and status to
-- ('pending', 'approved', 'rejected'), which is exactly the vocabulary this
-- flow uses.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. duration_months — what the brand bought, in months
--
-- The line item is a per-month Price with the month count as its quantity, so
-- this is literally the Stripe quantity. It is kept on the row because
-- start_date/end_date alone cannot distinguish "three months" from "a 92-day
-- run": the CHECK is what stops a hand-written row claiming a term that is not
-- sold.
--
-- NULL means "not sold by the month" — every pre-existing row, every house ad,
-- and every free request. The CHECK admits NULL for exactly that reason.
-- -----------------------------------------------------------------------------

alter table public.sponsored_listings
  add column if not exists duration_months integer;

comment on column public.sponsored_listings.duration_months is
  'Run length in months for a paid brand campaign: 1, 3 or 6. Mirrors '
  'AD_DURATIONS_MONTHS in lib/adPricing.tsx and is the quantity on the Stripe '
  'line item. NULL for house ads, job ads and free /dashboard/requests '
  'submissions, which are not sold by the month.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sponsored_listings_duration_months_check'
  ) then
    -- Validates against existing rows on creation. They are all NULL, so this
    -- passes without a rewrite.
    alter table public.sponsored_listings
      add constraint sponsored_listings_duration_months_check
      check (duration_months is null or duration_months in (1, 3, 6));
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2. stripe_session_id — the Checkout Session that paid for this campaign
--
-- Written twice, by both halves of the flow, and the second write is the one
-- that counts:
--
--   1. The checkout route records the Session it just created. That is what
--      lets a resumed checkout expire the previous Session instead of leaving
--      two payable ones open for the same campaign — a brand with both tabs
--      open would otherwise be charged twice for one month of one placement.
--   2. The webhook overwrites it with the Session that actually paid.
--
-- Reconciliation only — nothing reads it as a gate. It is what turns the
-- "PAID BUT NOT MARKED" log line in the webhook into something an admin can
-- actually chase in the Stripe dashboard.
-- -----------------------------------------------------------------------------

alter table public.sponsored_listings
  add column if not exists stripe_session_id text;

comment on column public.sponsored_listings.stripe_session_id is
  'Stripe Checkout Session id that paid for this campaign, written by the '
  'ad_payment branch of app/api/stripe/webhook/route.tsx. NULL for anything '
  'not paid for through Stripe. Reconciliation only — it gates nothing.';

-- Partial, so the many NULLs do not collide. One Session pays for one campaign;
-- if this index ever raises a conflict, two listings are claiming the same
-- payment and one of them is wrong.
create unique index if not exists sponsored_listings_stripe_session_id_key
  on public.sponsored_listings (stripe_session_id)
  where stripe_session_id is not null;


-- -----------------------------------------------------------------------------
-- 3. Index for the capacity count
--
-- countOverlappingAds() in lib/adCapacity.tsx filters on placement and a date
-- range, and runs three times per keystroke-ish on the campaign form (once per
-- placement). Small table today; this keeps it from becoming a sequential scan
-- per form render once it is not.
-- -----------------------------------------------------------------------------

create index if not exists sponsored_listings_placement_dates_idx
  on public.sponsored_listings (placement, start_date, end_date)
  where status <> 'rejected';


-- -----------------------------------------------------------------------------
-- 4. NOT INCLUDED, on purpose: hiding unpaid rows in RLS
--
-- "Unpaid ads never reach admin review and never render" is enforced in the
-- queries (hooks/usePublicAds.tsx and hooks/useAdRequests.tsx both exclude
-- payment_status = 'unpaid'), and the existing policy already keeps them away
-- from other users:
--
--   "Anyone can view active ads"
--     USING ((is_active AND status = 'approved') OR is_admin() OR submitted_by = auth.uid())
--
-- An unpaid row is is_active = false and status = 'pending', so it fails the
-- first arm. It stays visible to its own submitter, which is deliberate — that
-- is what the "Payment incomplete" card and its resume button read. It also
-- stays visible to admins, which is why useAdRequests filters in the query
-- rather than relying on the policy.
--
-- Tightening the policy to exclude unpaid rows from admins would break nothing
-- today and would hide exactly the rows an admin would want when reconciling a
-- payment. Left alone.
-- -----------------------------------------------------------------------------
