-- =============================================================================
-- Jobs: enough detail for an electrician to judge a post
--
-- The jobs table carried title, company, location, pay, description and
-- required_union_status. `pay` is free text, `location` is free text, and
-- nothing said what classification the work needs, whether it is residential or
-- industrial, when it starts, how long it runs, or what shift it is. A board
-- of those cannot be judged at a glance and cannot be filtered at all.
--
-- ADDITIVE ONLY. Every column here is nullable, nothing is dropped, and
-- nothing existing is rewritten. The seven jobs already posted have none of
-- this, and a NOT NULL would have to invent values for them.
--
-- REQUIREDNESS IS ENFORCED IN THE FORM, NOT IN THE SCHEMA, and that is a
-- deliberate split rather than an oversight. New posts must carry a
-- classification, a work type, a location, a pay rate and unit, and a
-- description — but the seven rows that predate this migration cannot, and a
-- NOT NULL constraint applies to them too. The CHECKs below therefore say
-- "null, or one of these", which is the strongest thing that can be true of
-- both the old rows and the new ones.
--
-- Revisit when the legacy rows are gone: at that point these can be tightened
-- to NOT NULL and the form stops being the only thing standing behind them.
--
-- TEXT PLUS CHECK, NOT AN ENUM, matching the rule in
-- docs/signup-and-brand-spec.md section 0.2 — there are no Postgres enum types
-- anywhere in this schema and this is not the place to start. Adding a shift
-- or a duration later is then an ALTER of one constraint rather than an enum
-- type change that locks the table.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The work
-- -----------------------------------------------------------------------------

alter table public.jobs
  add column if not exists classification text,
  add column if not exists work_type      text;

alter table public.jobs drop constraint if exists jobs_classification_ck;
alter table public.jobs
  add constraint jobs_classification_ck
    check (
      classification is null
      or classification in (
        'Apprentice',
        'Trainee',
        'Journeyman',
        'General Electrician',
        'Residential',
        'Fire/Life Safety',
        'Voice-Data-Video'
      )
    );

comment on column public.jobs.classification is
  'The classification the work needs. THE SAME SEVEN STRINGS as '
  'ELECTRICIAN_CLASSIFICATIONS in lib/signupRoles.tsx, which is what an '
  'electrician picks at signup — stored as the option text so a job''s '
  'requirement and a worker''s classification are directly comparable rather '
  'than being two vocabularies that need a mapping table to join.';

alter table public.jobs drop constraint if exists jobs_work_type_ck;
alter table public.jobs
  add constraint jobs_work_type_ck
    check (
      work_type is null
      or work_type in ('residential', 'commercial', 'industrial', 'service')
    );

comment on column public.jobs.work_type is
  'residential | commercial | industrial | service. Lower-case keys rather '
  'than display text, because unlike classification these are not shared with '
  'another table and the label belongs in lib/jobs.tsx.';


-- -----------------------------------------------------------------------------
-- 2. Where and when
--
-- NO `city` COLUMN. The obvious shape was a new `city` bound to the California
-- dropdown, and it was rejected: jobs.location already exists, is already
-- rendered by JobCard and JobDetailModal, and already holds free text on seven
-- rows. A second location column would mean two fields that both answer
-- "where", disagreeing the first time one is edited.
--
-- So `location` is reused and the FORM binds it to the same LocationField the
-- profile and signup use — a select over lib/locations.tsx with an Other
-- escape hatch. That component already handles a stored value outside the list
-- by opening the free-text box, which is exactly the state the seven legacy
-- rows are in. No backfill, no data loss, one field.
-- -----------------------------------------------------------------------------

alter table public.jobs
  add column if not exists starts_on date,
  add column if not exists duration  text,
  add column if not exists shift     text;

alter table public.jobs drop constraint if exists jobs_duration_ck;
alter table public.jobs
  add constraint jobs_duration_ck
    check (
      duration is null
      or duration in ('one_day', 'under_week', 'one_to_four_weeks', 'ongoing')
    );

alter table public.jobs drop constraint if exists jobs_shift_ck;
alter table public.jobs
  add constraint jobs_shift_ck
    check (shift is null or shift in ('day', 'night', 'weekend', 'flexible'));

comment on column public.jobs.starts_on is
  'The day the work starts. A date and not a timestamp: nobody schedules a '
  'trade job to the minute at posting time, and a timestamp would render an '
  'arbitrary 00:00 on every listing.';

comment on column public.jobs.duration is
  'How long the work runs, as a band. Bands rather than a number of days for '
  'the same reason years_experience is banded — the precision would be '
  'invented, and a filter buckets anyway.';


-- -----------------------------------------------------------------------------
-- 3. Pay
--
-- STRUCTURED, AND THE OLD FREE-TEXT COLUMN STAYS. `pay` is read by JobCard,
-- JobDetailModal and the applications list, and it is the only pay information
-- the seven existing rows have. Dropping it would blank them; parsing it into
-- numbers would be guessing at strings nobody validated.
--
-- So both exist for now. A listing renders the structured rate when it has
-- one and falls back to `pay` when it does not, which is a visible but
-- temporary inconsistency on seven rows against a permanently filterable field
-- on every row posted from here.
--
-- pay_rate_max IS THE RANGE, AND NULL MEANS A SINGLE RATE — not zero, and not
-- a copy of the minimum. The CHECK below allows null and otherwise requires it
-- to be at or above the minimum, so "45 to 35 an hour" cannot be stored.
-- -----------------------------------------------------------------------------

alter table public.jobs
  add column if not exists pay_rate_min numeric(10, 2),
  add column if not exists pay_rate_max numeric(10, 2),
  add column if not exists pay_unit     text;

alter table public.jobs drop constraint if exists jobs_pay_unit_ck;
alter table public.jobs
  add constraint jobs_pay_unit_ck
    check (pay_unit is null or pay_unit in ('hour', 'day'));

alter table public.jobs drop constraint if exists jobs_pay_rate_ck;
alter table public.jobs
  add constraint jobs_pay_rate_ck
    check (
      (pay_rate_min is null or pay_rate_min >= 0)
      and (pay_rate_max is null or pay_rate_max >= 0)
      -- A maximum without a minimum is not a range, it is a missing field.
      and (pay_rate_max is null or pay_rate_min is not null)
      and (pay_rate_max is null or pay_rate_min is null or pay_rate_max >= pay_rate_min)
    );

comment on column public.jobs.pay_rate_min is
  'The rate, or the bottom of the range. numeric(10,2) rather than integer '
  'cents: rates are quoted in dollars with at most two decimals, and the two '
  'decimals are what stops 47.50 being entered as 47.';

comment on column public.jobs.pay_rate_max is
  'Top of the range, or NULL for a single rate. NULL rather than equal to the '
  'minimum, so "45/hr" and "45 to 45/hr" are not stored identically.';

comment on column public.jobs.pay_unit is
  'hour | day. Required alongside a rate by the posting form — a number with '
  'no unit is unreadable, and $400 means very different things per hour and '
  'per day.';


-- -----------------------------------------------------------------------------
-- 4. Requirements
-- -----------------------------------------------------------------------------

alter table public.jobs
  add column if not exists min_years_experience  text,
  add column if not exists certification_required text,
  add column if not exists requires_own_tools     boolean not null default false,
  add column if not exists requires_own_transport boolean not null default false;

alter table public.jobs drop constraint if exists jobs_min_years_experience_ck;
alter table public.jobs
  add constraint jobs_min_years_experience_ck
    check (
      min_years_experience is null
      or min_years_experience in ('0-2 years', '3-5 years', '6-10 years', '10+ years')
    );

comment on column public.jobs.min_years_experience is
  'THE SAME BAND STRINGS as EXPERIENCE_BANDS in lib/signupRoles.tsx and as '
  'profiles.years_experience. One vocabulary, so "does this worker meet this '
  'job''s minimum" is a comparison between two columns holding the same '
  'values rather than a translation.';

comment on column public.jobs.certification_required is
  'Free text on purpose. Certifications in this trade are not a closed list — '
  'OSHA 30, a manufacturer course, a county card — and a select would either '
  'be wrong or become a maintenance burden. Displayed, never matched on.';

comment on column public.jobs.requires_own_tools is
  'NOT NULL DEFAULT false, unlike every other column here, because the two '
  'checkboxes are genuinely three-valued nowhere: unticked means not required. '
  'The seven legacy rows correctly become false.';


-- -----------------------------------------------------------------------------
-- 5. Indexes
--
-- ONE, AND ONLY BECAUSE THE BOARD IS ABOUT TO PAGE ON IT. The jobs list orders
-- by created_at descending with a range window, so that ordering is now read
-- on every page of every visit.
--
-- The filter indexes the shape of this data invites — (work_type, location),
-- (classification) — are NOT created here, deliberately. Nothing filters on
-- them yet: the form writes the columns and the listings display them, and the
-- board still fetches in one order with no predicate. An index with no query
-- behind it is a write cost and a line in a plan nobody reads. Add them with
-- the filtering, and measure first: at seven rows, and at seven thousand,
-- Postgres will sequential-scan this table whatever is on it.
-- -----------------------------------------------------------------------------

create index if not exists jobs_created_at_idx
  on public.jobs (created_at desc);
