-- =============================================================================
-- Name matching: people type business names without spaces
--
-- THE REPORTED FAILURE. A real C-10 holder entered "Thomasheinzmanelectrical".
-- CSLB has "THOMAS HEINZMAN ELECTRICAL". Same name, no spaces, and
-- cslb_names_match() said no — so a legitimate contractor went to manual
-- review.
--
-- WHY IT FAILED, exactly. cslb_business_tokens() splits on runs of non-
-- alphanumerics and drops stop words, including the trade words:
--
--   claimed "Thomasheinzmanelectrical" -> {thomasheinzmanelectrical}
--   CSLB    "THOMAS HEINZMAN ELECTRICAL" -> {heinzman, thomas}
--
-- Neither set contains the other, so cslb_tokens_overlap() is false. The
-- run-together form is ONE token that can never be a subset of a multi-token
-- set, so every multi-word business name fails this way.
--
-- THE FIX: a second comparison, on the normalised strings with all whitespace
-- removed. Added as an OR, so nothing that matches today stops matching.
--
--   'thomasheinzmanelectrical' = 'thomasheinzmanelectrical'  -> match
--
-- THE SQUASH IS OVER THE FULL NORMALISED STRING, NOT THE TOKEN SET, and that
-- distinction is the whole of why this works. The token set has stop words
-- removed, so "THOMAS HEINZMAN ELECTRICAL" would squash to 'heinzmanthomas'
-- (sorted, trade word dropped) while the claimed blob keeps its 'electrical'.
-- Those never meet. Squashing before the stop list runs is what lines them up.
--
-- IT IS EXACT EQUALITY, not a fuzzy or edit-distance comparison. Two names
-- match here only if every letter and digit, in order, is identical once case,
-- spaces and punctuation are gone. That is a strict test wearing a loose-
-- looking name.
--
-- MEASURED AGAINST THE 29,123 C-10 NAMES in the 2026-09-19 file:
--
--   benefit  28,804 of 29,123 holders would be rejected today if they typed
--            their own registered name with the spaces removed. All 28,804
--            match after this change.
--
--   cost     215 groups covering 802 licences (2.8%) are names this newly
--            treats as equal to each other. 156 of those groups are initials
--            -- "J C ELECTRIC" / "JC ELECTRIC" / "J & C ELECTRIC" -- which
--            were weakly distinguishing to begin with. The other 59 are
--            spacing variants of genuinely identical names: TOWERS / TOWER'S,
--            LIVE WIRE / LIVEWIRE, SO CAL / SOCAL / SO-CAL, WALTS / WALT'S.
--            Those businesses share a name in the real register whatever this
--            function does.
--
-- WHY THE COST IS SMALLER THAN 802 SUGGESTS. This function compares ONE
-- claimed name against ONE licence row, already pinned by licence number. A
-- collision between two CSLB records is not by itself a wrong verification --
-- it only matters if somebody enters a number that is not theirs AND their own
-- business name squashes to the holder's. The already_claimed check and human
-- review both still sit behind this.
-- =============================================================================

create or replace function public.cslb_squash_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Same normalisation cslb_business_tokens() starts from -- lower case, every
  -- run of non-alphanumerics to a single space, trimmed -- and then the spaces
  -- taken out entirely. Deliberately BEFORE the stop list: see the header.
  select replace(
    btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')),
    ' ',
    ''
  );
$$;

comment on function public.cslb_squash_name(text) is
  'A business name reduced to its letters and digits, in order, with case, '
  'spaces and punctuation gone. The comparison that catches a name typed '
  'without spaces -- which is most of them, on a phone. Keeps stop words, '
  'unlike cslb_business_tokens(): the claimed blob carries its trade word and '
  'the spaced name has to keep its own for the two to line up.';


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
    -- Unchanged: word-level containment, either direction.
    public.cslb_tokens_overlap(
      public.cslb_business_tokens(p_claimed),
      public.cslb_business_tokens(p_cslb_business)
    )
    or public.cslb_tokens_overlap(
      public.cslb_business_tokens(p_claimed),
      public.cslb_business_tokens(p_cslb_full)
    )
    -- New: the same name with the spaces taken out. nullif guards the empty
    -- string, which would otherwise match every record whose name is entirely
    -- punctuation -- the same guard cslb_tokens_overlap() makes with its
    -- array_length check, and for the same reason.
    or nullif(public.cslb_squash_name(p_claimed), '')
       = public.cslb_squash_name(p_cslb_business)
    or nullif(public.cslb_squash_name(p_claimed), '')
       = public.cslb_squash_name(p_cslb_full);
$$;

comment on function public.cslb_names_match(text, text, text) is
  'Whether the business name on the account resembles either name on the CSLB '
  'record. Two comparisons: word-level containment, and exact equality once '
  'case, spaces and punctuation are removed -- the second because people type '
  'business names run together, especially on phones, and a single blob can '
  'never be a subset of a multi-word token set. Loose by design: a false '
  'mismatch sends one request to a human, a false match hands over somebody '
  'else''s licence.';


revoke all on function public.cslb_squash_name(text) from anon, authenticated;
grant execute on function public.cslb_squash_name(text) to service_role;


-- -----------------------------------------------------------------------------
-- Re-check the accounts this was getting wrong
--
-- cslb_apply_check() returns 'unchanged' and writes nothing when status, expiry
-- and reason all match the last check, so a badge sitting at name_mismatch will
-- NOT re-evaluate on its own just because the rule changed -- the same early
-- return that made 20260922140000 necessary.
--
-- Scoped to name_mismatch. Every other queued reason is a real finding that
-- this change has no bearing on, and re-running them would churn audit rows and
-- risk an alert for no reason.
--
-- The sweep is what re-decides them; this only clears the "nothing changed"
-- guard by moving the badge off the state it is being compared against. Doing
-- it the other way round -- calling cslb_apply_check directly per profile --
-- would need the business name, which lives in role_credentials and differs
-- per row.
-- -----------------------------------------------------------------------------

do $$
declare
  moved integer;
begin
  update public.user_badges
  set check_reason = null
  where badge_key = 'license_verified'
    and status = 'pending'
    and check_reason = 'name_mismatch';

  get diagnostics moved = row_count;
  raise notice 'cleared name_mismatch on % badge(s); the next sweep re-decides them', moved;
end;
$$;
