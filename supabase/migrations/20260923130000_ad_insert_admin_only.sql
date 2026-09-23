-- =============================================================================
-- sponsored_listings: INSERT is admins only
--
-- THE HOLE. The baseline policy was
--
--   "Admins can insert ads"  WITH CHECK
--     ( is_admin() OR (submitted_by = auth.uid() AND status = 'pending') )
--
-- The second branch let any signed-in user insert their own pending row with
-- EVERY OTHER COLUMN unchecked — source, payment_status, amount_charged,
-- duration_months, city, dates, link_url. Tested on staging 2026-09-23: a demo
-- electrician inserted a row claiming source 'brand', payment_status 'paid',
-- six months, and it appeared in the admin "Advertisement requests" queue as a
-- prepaid campaign. No payment had happened.
--
-- WHO NEEDS THE USER BRANCH: NOBODY.
--   - Brand checkout (app/api/stripe/checkout/ad/route.tsx) inserts with the
--     service role, which bypasses RLS.
--   - The Stripe webhook marks the row paid with the service role.
--   - The admin panel's direct create (hooks/useAds.tsx) uses is_admin().
--   - The one caller that used the user branch — the free ad request on
--     /dashboard/requests (useSubmitAdRequest) — was removed on 2026-09-23.
--
-- WHY NOT NARROW IT INSTEAD — e.g. "own row, source brand, unpaid". A row the
-- user inserts directly has skipped the route's validation, and the route's
-- resume-payment path would then take payment for it: resume re-checks
-- placement, term, start date and capacity, but not link_url (the create step
-- refuses javascript: URLs — stored XSS on three public pages otherwise),
-- title, city or image. Matching the route in SQL would mean two copies of the
-- same rules drifting apart, which is how this hole appeared. The route is the
-- one way in; the policy should say so.
--
-- Nothing else changes: SELECT (live ads, own rows, admins), UPDATE and DELETE
-- (admins only) are untouched. No data is touched — every existing row was
-- written by the service role or an admin.
--
-- A future feature that creates ad rows from the browser needs a server route
-- with the service role, not a wider policy.
--
-- Idempotent: drop-if-exists then create.
-- =============================================================================

drop policy if exists "Admins can insert ads" on public.sponsored_listings;

create policy "Admins can insert ads"
  on public.sponsored_listings
  for insert
  with check (public.is_admin());

comment on policy "Admins can insert ads" on public.sponsored_listings is
  'Admins only. Brand campaigns are created by app/api/stripe/checkout/ad with the service role, and marked paid by the Stripe webhook, both of which bypass RLS. A user branch existed until 20260923130000 and allowed forged "paid" rows.';
