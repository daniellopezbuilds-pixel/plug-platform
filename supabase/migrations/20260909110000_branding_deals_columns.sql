-- =============================================================================
-- Branding deals: additive columns, storage upload policy, payment_status
--
-- Source: supabase/archive/branding-deals-setup.sql (hand-run 2026-09-09).
-- Spec:   docs/signup-and-brand-spec.md sections 0.4 and 7.5.
--
-- STATUS: ALREADY APPLIED to the live project. Every statement below is
-- present in the 20260908000000 baseline and is a no-op against production.
-- This file exists so `db reset` reproduces the change and so the hand-run
-- script has a home in the migration history rather than in a loose .sql file.
--
-- Verified against the baseline before writing:
--   sponsored_listings.city                     present
--   sponsored_listings.source   default         'internal'  present
--   sponsored_listings.review_notes             present
--   conversation_participants.payment_status    present
--   storage policy "authenticated users upload ad images"  present
--
-- The COMMENT statements are the one part that is NOT in the baseline. The
-- pg_dump captured exactly one public-schema comment (on
-- profiles_guard_admin_escalation), so the column comments in the hand-run
-- script were never actually applied. They are the only statements here that
-- change anything on the live database, and they change documentation only.
--
-- Section 2 of the original script ("DO NOT RUN" — the table RLS that already
-- existed and was stricter than what was asked for) is deliberately not
-- carried over. Section 4's bucket-limit statement was commented out there as
-- a judgement call and stays out here for the same reason.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. sponsored_listings — three additive columns
--
-- All nullable or defaulted, no backfill. `source` carries a default so every
-- pre-existing row becomes 'internal' without one.
-- -----------------------------------------------------------------------------

alter table public.sponsored_listings
  add column if not exists city text;

comment on column public.sponsored_listings.city is
  'Target city for the campaign, or "All of California". Free text — the option '
  'list lives in CALIFORNIA_CITIES in app/dashboard/branding-deals/page.tsx. '
  'State is not stored: everything is California today.';

alter table public.sponsored_listings
  add column if not exists source text default 'internal';

comment on column public.sponsored_listings.source is
  '''brand'' for ads submitted through /dashboard/branding-deals, ''internal'' '
  'for house and job ads created in the admin panel. Set by createBrandAd in '
  'hooks/useAds.tsx. Routing and listing only — it does not affect rendering: '
  'an approved ad from either source renders identically.';

alter table public.sponsored_listings
  add column if not exists review_notes text;

comment on column public.sponsored_listings.review_notes is
  'Admin reason for rejecting an ad, shown back to the brand that submitted it. '
  'Written by the reject action in hooks/useAdRequests.tsx. Null for anything '
  'not rejected. Visible to the submitter, so it is reviewer-to-brand feedback, '
  'not an internal note.';


-- -----------------------------------------------------------------------------
-- 2. Storage: let authenticated users upload ad images
--
-- storage.objects had no INSERT policy covering the sponsored-listings bucket
-- for authenticated users, so uploadAdImage() in lib/ads.tsx returned 403 for
-- every non-admin. That broke the existing /dashboard/requests flow as well as
-- the brand form.
--
-- Bucket-wide rather than per-user-folder: uploadAdImage writes flat names
-- (`ad-<timestamp>.<ext>`) at the bucket root and is shared with the admin
-- form, so folder scoping would require changing the uploader.
--
-- The bucket is already public for reads, so only INSERT is needed.
--
-- NOTE for a fresh `db reset`: this policy references bucket_id
-- 'sponsored-listings', and storage.buckets rows are DATA, not schema — the
-- baseline does not contain them. See supabase/README.md, "What the baseline
-- does not carry".
-- -----------------------------------------------------------------------------

drop policy if exists "authenticated users upload ad images" on storage.objects;
create policy "authenticated users upload ad images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sponsored-listings');


-- -----------------------------------------------------------------------------
-- 3. conversation_participants.payment_status
--
-- The Stripe webhook's group_join branch already writes this column. It did
-- not exist, so that write always failed — and failed silently, because the
-- result was awaited without destructuring `error`. A paid group join took the
-- money and granted nothing.
--
-- Nullable with no default, deliberately. Every existing participant joined
-- before paid group joins existed, and null is the honest value for them:
-- "no payment was required". A default of 'unpaid' would retroactively mark
-- every member of every conversation as owing money; 'paid' would assert a
-- payment that never happened.
--
-- Nothing reads it yet — group-checkout still has no caller.
-- -----------------------------------------------------------------------------

alter table public.conversation_participants
  add column if not exists payment_status text;

comment on column public.conversation_participants.payment_status is
  '''paid'' once a group-join checkout completes, written by the group_join '
  'branch of app/api/stripe/webhook/route.tsx. NULL means no payment was '
  'required — every participant predating paid group joins, and every member '
  'of a free conversation. Nothing reads this yet; it is not a gate.';
