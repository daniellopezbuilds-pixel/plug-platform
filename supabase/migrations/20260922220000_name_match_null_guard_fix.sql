-- =============================================================================
-- Fix: a blank business name verified instead of going to review
--
-- INTRODUCED BY 20260922210000, CAUGHT BY ITS OWN TEST, live for one migration.
-- The new branches were written as:
--
--     or nullif(public.cslb_squash_name(p_claimed), '')
--        = public.cslb_squash_name(p_cslb_business)
--
-- The nullif was meant to be the guard that stops an empty claimed name
-- matching every record -- the same job cslb_tokens_overlap() does with its
-- array_length check. It does the opposite, because of three-valued logic:
--
--     claimed ''  ->  nullif('', '') is NULL
--                 ->  NULL = 'acmeelectric'  is NULL, not false
--                 ->  false or false or NULL or NULL  is NULL, not false
--
-- and then in cslb_evaluate_license():
--
--     name_ok := public.cslb_names_match(...);   -- NULL
--     ...
--     when not name_ok then 'name_mismatch'      -- not NULL is NULL, not true
--
-- so the branch does not fire, evaluation falls through to `else null`, and the
-- verdict is VERIFY. An account with an empty or punctuation-only business name
-- auto-verified against any licence number that was otherwise clean and
-- unclaimed -- which is precisely the "blank name matches everything" failure
-- the original function was built to prevent, reintroduced through NULL rather
-- than through equality.
--
-- THE FIX: an explicit emptiness test, so every operand is a plain boolean and
-- the expression cannot be NULL. cslb_squash_name() coalesces its input, so it
-- returns '' and never NULL -- there is nothing else in here that can produce
-- one.
--
-- WHY A NEW FILE rather than correcting 20260922210000: that migration is
-- applied, and an applied migration is a record of what ran. See
-- supabase/README.md.
--
-- Production has neither file yet, so it will take both in one push and never
-- sees the intermediate state.
-- =============================================================================

create or replace function public.cslb_names_match(
  p_claimed text,
  p_cslb_business text,
  p_cslb_full text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    -- Word-level containment, either direction. Unchanged since 20260921140000.
    public.cslb_tokens_overlap(
      public.cslb_business_tokens(p_claimed),
      public.cslb_business_tokens(p_cslb_business)
    )
    or public.cslb_tokens_overlap(
      public.cslb_business_tokens(p_claimed),
      public.cslb_business_tokens(p_cslb_full)
    )
    -- The same name with the spaces taken out, for the run-together typing
    -- that 20260922210000 exists to handle.
    --
    -- The `<> ''` is the guard, and it has to be a real boolean test rather
    -- than a nullif: an empty claimed name must make this branch FALSE, not
    -- NULL. Both operands of every comparison below are non-null by
    -- construction, so the whole expression is two-valued.
    or (
      public.cslb_squash_name(p_claimed) <> ''
      and (
        public.cslb_squash_name(p_claimed)
          = public.cslb_squash_name(p_cslb_business)
        or public.cslb_squash_name(p_claimed)
          = public.cslb_squash_name(p_cslb_full)
      )
    );
$$;

comment on function public.cslb_names_match(text, text, text) is
  'Whether the business name on the account resembles either name on the CSLB '
  'record. Two comparisons: word-level containment, and exact equality once '
  'case, spaces and punctuation are removed -- the second because people type '
  'business names run together, especially on phones, and a single blob can '
  'never be a subset of a multi-word token set. RETURNS FALSE, NEVER NULL, for '
  'an empty claimed name: a NULL propagates through `not name_ok` in '
  'cslb_evaluate_license() and silently verifies. Loose by design: a false '
  'mismatch sends one request to a human, a false match hands over somebody '
  'else''s licence.';
