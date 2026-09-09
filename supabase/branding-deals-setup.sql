-- =============================================================================
-- Branding deals — run this by hand in the Supabase SQL editor.
--
-- Deliberately NOT in supabase/migrations and NOT part of supabase/pending.sql.
--
-- Everything below was probed against the live project on 2026-09-09 before
-- being written. Two of the three sections turned out differently from the
-- original plan — read the notes, don't just run it.
--
-- REQUIRED : section 1 (the city and review_notes columns)
-- REQUIRED : section 3 (storage upload policy) — the form cannot work without
--            it, and this was not in the original scope
-- NOT NEEDED: section 2 (table RLS) — the policies asked for already exist and
--            are STRICTER than the ones requested. Adding the requested version
--            would weaken them. Do not run section 2.
--
-- STATUS as of 2026-09-09, re-checked against the live project:
--   city          APPLIED
--   review_notes  APPLIED
--   storage policy (section 3)  APPLIED — an authenticated upload now returns 200
--   source        NOT APPLIED — the only outstanding statement
--
-- Everything in section 1 is `add column if not exists`, so re-running the
-- whole script is safe.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. REQUIRED. Two additive columns. Both nullable, no defaults, no backfill.
-- -----------------------------------------------------------------------------

alter table public.sponsored_listings
  add column if not exists city text;

comment on column public.sponsored_listings.city is
  'Target city for the campaign, or "All of California". Free text — the option '
  'list lives in CALIFORNIA_CITIES in app/dashboard/branding-deals/page.tsx. '
  'State is not stored: everything is California today.';

-- Distinguishes brand self-service ads from the admin's own house/job ads.
-- The default is what keeps this additive: every existing row becomes
-- 'internal' without a backfill, and the admin ad manager is unaffected.
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
-- 2. DO NOT RUN. Table RLS is already correct.
--
-- The request was for a policy letting an authenticated user insert their own
-- row and select rows where submitted_by = auth.uid(). Both already hold.
-- Verified from a real signed-in session (anon key + user JWT):
--
--   insert, submitted_by = own uid, status 'pending'  -> 201 created
--   insert, submitted_by = another user's uid         -> 403  42501
--   insert, status 'approved'                         -> 403  42501
--   select                                            -> returns own pending
--                                                        rows, plus other
--                                                        people's approved ads
--
-- So the existing policy enforces submitted_by = auth.uid() AND refuses
-- self-approval. The requested insert policy checks only submitted_by:
--
--   -- create policy "users insert their own sponsored listing"
--   --   on public.sponsored_listings for insert
--   --   to authenticated
--   --   with check (submitted_by = (select auth.uid()));
--
-- Postgres ORs permissive policies together, so adding that would ALLOW a user
-- to insert status = 'approved' and publish their own ad without review. That
-- is a security regression, not an addition. Leave the table's policies alone.
--
-- To read what is actually there:
--
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies
--   where schemaname = 'public' and tablename = 'sponsored_listings'
--   order by cmd, policyname;
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 3. REQUIRED, and not in the original scope. Storage upload policy.
--
-- The brand form's image upload fails today. As a signed-in non-admin user:
--
--   POST /storage/v1/object/sponsored-listings/<file>
--     -> 403 AccessDenied "new row violates row-level security policy"
--
-- storage.objects has no INSERT policy covering the sponsored-listings bucket
-- for authenticated users, so lib/ads.tsx uploadAdImage() cannot write.
--
-- This is NOT specific to branding deals. components/requests/SubmitAdRequest.tsx
-- — the existing "submit an ad request" flow at /dashboard/requests — calls the
-- same uploadAdImage(), so it is broken for every non-admin user today, and has
-- been. Adding this policy fixes both.
--
-- The bucket is already public for reads (public = true), so only INSERT is
-- needed; getAdPublicUrl keeps working untouched.
-- -----------------------------------------------------------------------------

drop policy if exists "authenticated users upload ad images" on storage.objects;
create policy "authenticated users upload ad images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sponsored-listings');


-- -----------------------------------------------------------------------------
-- 4. Worth knowing about section 3.
--
-- The policy is bucket-wide: any signed-in user may write any object name into
-- sponsored-listings. It cannot be scoped per-user by folder without changing
-- uploadAdImage(), which writes flat names (`ad-<timestamp>.<ext>`) at the
-- bucket root and is shared with the admin form.
--
-- The 4:1 / 2MB / PNG-JPEG-WebP rules in lib/ads.tsx are enforced in the
-- browser only, so they are not a real limit on what reaches the bucket. If
-- that matters, set server-side limits on the bucket itself — it currently has
-- file_size_limit = null and allowed_mime_types = any:
--
--   update storage.buckets
--   set file_size_limit = 2097152,
--       allowed_mime_types = array['image/png','image/jpeg','image/webp']
--   where id = 'sponsored-listings';
--
-- That is a judgement call, not a requirement, so it is left commented.
-- -----------------------------------------------------------------------------
