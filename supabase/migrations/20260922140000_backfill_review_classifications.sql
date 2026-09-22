-- =============================================================================
-- Backfill checked_classifications on audit rows written before it existed
--
-- WHY THIS CANNOT WAIT FOR THE NEXT SWEEP. cslb_apply_check() returns
-- 'unchanged' and writes nothing at all when status, expiry and reason all
-- match the last check. That early return is correct and load-bearing -- it is
-- what stops a standing conflict re-alerting every week -- but it means a
-- column added after a check ran is never filled in by running the check again.
-- The audit rows for every contractor swept between 20260922120000 and
-- 20260922130000 would read "not a C-10 licence" with no classification, for
-- good, on precisely the cards the classification was surfaced for.
--
-- Staging has two such rows right now. Production will have none if
-- 20260922130000 is pushed before its first import, which is the intended
-- order; this file is harmless there.
--
-- Same shape as the check_reason backfill in section 5 of 20260921150000, and
-- for the same reason.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ONLY ROWS THAT ACTUALLY READ A RECORD
--
-- Two conditions, and both are about not putting evidence on a row that never
-- saw it:
--
--   1. The reason must be one that found a licence. cslb_evaluate_license()
--      returns before touching cslb_licenses for no_number, stale_data and
--      not_found -- writing classifications onto a not_found row would have it
--      claim, in an audit trail, to have read a record it reported as absent.
--      A NULL reason is an automated approval, which did read one.
--
--   2. The row's vintage must match the import being read. Every row in
--      cslb_licenses carries the same source_as_of, and a review row records
--      which vintage it consulted. Filling one from a DIFFERENT file would be
--      backdating today's data onto last week's decision -- the audit row would
--      be internally consistent and wrong, which is worse than incomplete.
--
-- Rows that fail either test keep their NULL, which the card already renders as
-- "no classifications field" rather than an empty list.
--
-- Idempotent: `is null` means a second run matches nothing.
-- -----------------------------------------------------------------------------

update public.user_badge_reviews r
set checked_classifications = l.class_keys
from public.cslb_licenses l
where r.checked_classifications is null
  and r.source = 'cslb_import'
  and r.checked_identifier is not null
  and l.license_no = r.checked_identifier
  and l.source_as_of = r.source_as_of
  and (
    r.reason is null
    or r.reason not in ('no_number', 'stale_data', 'not_found')
  )
  and coalesce(array_length(l.class_keys, 1), 0) > 0;
