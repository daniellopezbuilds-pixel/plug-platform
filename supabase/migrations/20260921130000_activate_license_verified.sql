-- =============================================================================
-- Switch the license_verified badge on
--
-- STATUS: not yet applied. PUSH THIS ONLY AFTER AN IMPORT HAS BEEN LOADED INTO
-- THE ENVIRONMENT YOU ARE PUSHING TO. The order, per environment, is:
--
--   1. push 20260921120000            (machinery; inert on its own)
--   2. node scripts/import-cslb.mjs   (loads cslb_licenses for THAT project)
--   3. push this file                 (switches the badge on, sweeps)
--
-- Staging all the way through, then production all the way through. The import
-- is not a migration and does not travel with one -- cslb_licenses is data, and
-- each project needs its own load. This is the same class of thing as the
-- storage buckets and SMTP config in supabase/README.md: it does not come
-- across on a db push.
--
--
-- WHY THIS IS A SEPARATE FILE FROM THE MACHINERY
--
-- 20260916130000 shipped both review badges inactive on purpose, and said
-- switching one on should be "one UPDATE, no migration" once someone owns the
-- queue. This is a migration anyway, for one reason the note could not have
-- anticipated: the flip is no longer only a flip. It now also has to sweep
-- every existing C-10 against the newly imported data, and that sweep has to
-- happen in the same breath as the flip -- otherwise the badge is live and
-- every contractor who signed up before today holds nothing, with no event
-- coming that would fix it.
--
-- Keeping it out of 20260921120000 is what lets that file be pushed and tested
-- on an empty database without touching a single signup.
--
--
-- WHAT THIS DOES NOT DO
--
-- It does not touch business_verified, and it does not run the employer_verified
-- re-sync described in section 7b of 20260916130000. That badge, that backfill
-- and the drift it has accumulated are a separate decision with a separate
-- backfill, and bundling them here would mean this file could not be reasoned
-- about on its own.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The flip
--
-- `active` was deliberately left out of the seed's ON CONFLICT DO UPDATE in
-- 20260916130000, precisely so that re-running that migration could never
-- switch a badge someone turned on back off. This is the intended way to turn
-- one on.
-- -----------------------------------------------------------------------------

update public.badges
   set active = true
 where key = 'license_verified';


-- -----------------------------------------------------------------------------
-- 2. The first sweep
--
-- GUARDED ON THE DATA ACTUALLY BEING THERE. If this file is pushed before an
-- import -- the one ordering mistake available here -- an unguarded sweep would
-- evaluate every contractor against an empty table, get 'stale_data' for all of
-- them, and fill the review queue with entries whose stated reason is about our
-- own data rather than about anybody's licence. Recoverable, because the next
-- import's sweep corrects it, but it would put an administrator through a queue
-- that should never have existed.
--
-- So: check the age first, and say so loudly rather than doing it anyway. The
-- migration still succeeds -- refusing to apply would leave the badge switched
-- on in step 1 and the file half-run -- and running the import afterwards
-- performs exactly the sweep that was skipped.
-- -----------------------------------------------------------------------------

do $$
declare
  age_days integer;
  tally    text;
begin
  age_days := public.cslb_data_age_days();

  if age_days is null then
    raise warning
      'license_verified is now ACTIVE but no CSLB file has been imported into '
      'this project. The first sweep was skipped. Run '
      'scripts/import-cslb.mjs against this project now -- its post-import '
      'sweep does what was skipped here.';
    return;
  end if;

  if age_days > 30 then
    raise warning
      'license_verified is now ACTIVE but the newest CSLB import is % days '
      'old, past the 30-day staleness limit. The first sweep was skipped '
      'rather than run against data too old to verify anyone with. Download '
      'the current file and import it.', age_days;
    return;
  end if;

  select string_agg(r.outcome || '=' || r.accounts, ', ' order by r.outcome)
    into tally
  from public.cslb_recheck_all() r;

  raise notice 'license_verified active. First sweep: %',
    coalesce(tally, 'no C-10 contractors found');
end;
$$;
