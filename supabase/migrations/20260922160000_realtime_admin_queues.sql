-- =============================================================================
-- Realtime for the admin queues
--
-- The admin panel's tab counts are meant to update without a refresh, so an
-- administrator sitting on the page sees work arrive. That needs the tables
-- behind those queues to be in the `supabase_realtime` publication; Postgres
-- only streams what a publication carries, and a subscription to a table that
-- is not in one succeeds and then silently never fires.
--
-- WHAT THIS DOES NOT CHANGE: WHO CAN SEE WHAT. `postgres_changes` applies RLS
-- per subscriber — a client is sent a row only if it could have SELECTed it.
-- Publication membership enables push; it does not widen access. The policies
-- on these five tables are unchanged, and the admin-only ones stay admin-only.
--
-- `profiles` IS THE ONE WORTH A SECOND THOUGHT, because any authenticated user
-- can read it, so any authenticated user can now subscribe to changes on it.
-- That is not new access — the directory already reads the same rows — but it
-- is a new way to watch them. It is in here because the union verification
-- queue is a query over profiles, and without it that count alone would sit
-- stale while the other four moved, which is worse than either all-live or
-- all-static: a number that is usually right teaches you to trust it.
--
-- IDEMPOTENT. `alter publication ... add table` errors if the table is already
-- a member, and Supabase projects vary in what they ship with, so each is
-- guarded on pg_publication_tables rather than assumed absent.
-- =============================================================================

do $$
declare
  t text;
begin
  -- The publication itself is created by Supabase on project setup. If it is
  -- somehow absent, say so plainly rather than failing on the first add with a
  -- message about a publication nobody mentioned.
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception
      'publication supabase_realtime does not exist on this project. '
      'Realtime has to be enabled in the dashboard before this migration.'
      using errcode = '42704';
  end if;

  foreach t in array array[
    'employer_documents',  -- Employer Verification
    'general_requests',    -- All Requests
    'sponsored_listings',  -- Advertisement Requests
    'user_badges',         -- Badge Requests
    'profiles'             -- Union Verification; see the note above
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
      raise notice 'added public.% to supabase_realtime', t;
    else
      raise notice 'public.% already in supabase_realtime, left alone', t;
    end if;
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- REPLICA IDENTITY
--
-- An UPDATE or DELETE event carries the OLD row only as far as the replica
-- identity allows, which defaults to the primary key. The admin counts are
-- driven by re-counting on any event rather than by reading the payload, so
-- the default is enough and nothing here changes it.
--
-- Deliberately NOT `replica identity full` on these tables: it writes the
-- entire old row into the WAL for every update, and the one thing it would buy
-- — knowing which columns changed — is not something the counts use.
-- -----------------------------------------------------------------------------
