-- =============================================================================
-- Realtime for the Messages badge
--
-- useUnreadMessagesCount recounts on two events: an INSERT into `messages`
-- (something arrived) and an UPDATE to the caller's own
-- `conversation_participants` row (useMessages writes last_read_at when a
-- thread is opened). Checked against both projects on 2026-09-23:
--
--   messages                  published on PRODUCTION, NOT on staging. It was
--                             added in the production dashboard at some point
--                             and never captured in a migration, which is the
--                             drift CLAUDE.md warns about. So on staging the
--                             Messages badge never moved without a reload.
--   conversation_participants published on NEITHER. So reading a thread never
--                             cleared the badge -- the recount it was waiting
--                             for never fired -- on either project.
--
-- Same as the others: without publication membership the subscription
-- succeeds and silently never fires.
--
-- DOES NOT WIDEN ACCESS. postgres_changes applies RLS per subscriber, and both
-- tables are scoped to conversation participants. The Messages hook subscribes
-- to `messages` unfiltered; RLS is what limits it to the caller's own threads.
--
-- Idempotent, guarded on pg_publication_tables, same shape as 20260922160000.
-- On production `messages` is already a member and is left alone.
-- =============================================================================

do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception
      'publication supabase_realtime does not exist on this project. '
      'Realtime has to be enabled in the dashboard before this migration.'
      using errcode = '42704';
  end if;

  foreach t in array array[
    'messages',                  -- a new message raises the badge
    'conversation_participants'  -- last_read_at clears it
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
