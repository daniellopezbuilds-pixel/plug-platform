-- =============================================================================
-- Realtime for notifications
--
-- ANSWERING THE QUESTION DIRECTLY: yes, the table needed adding.
-- 20260922160000 put the five admin-queue tables into `supabase_realtime`
-- (employer_documents, general_requests, sponsored_listings, user_badges,
-- profiles) and did not include `notifications`, because the admin counts do
-- not read it. The bell and the sidebar do.
--
-- `messages` is already a member -- useMessages has subscribed to it since long
-- before any of this -- which is why message threads already update live and
-- the bell did not.
--
-- WITHOUT THIS the subscription succeeds and simply never fires. That is the
-- failure worth naming: no error, no warning, a bell that looks wired up and
-- silently only ever updates on a page load.
--
-- RLS STILL DECIDES WHO SEES WHAT. `postgres_changes` evaluates the
-- subscriber's policies per row, and notifications has a SELECT policy scoped
-- to user_id = auth.uid(). So a client subscribed to this table is sent its
-- OWN notifications and nobody else's, and the filter the bell passes
-- (`user_id=eq.<id>`) is a bandwidth optimisation rather than the boundary.
-- Publication membership enables push; it does not widen access.
--
-- Idempotent, guarded on pg_publication_tables, same shape as 20260922160000.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception
      'publication supabase_realtime does not exist on this project. '
      'Realtime has to be enabled in the dashboard before this migration.'
      using errcode = '42704';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
    raise notice 'added public.notifications to supabase_realtime';
  else
    raise notice 'public.notifications already in supabase_realtime, left alone';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Supporting index
--
-- The bell reads "my newest notifications" and "how many of mine are unread",
-- and the sidebar re-runs its counts on every realtime event. 20260921160000
-- added notifications (user_id, type, created_at) for the claim-alert dedupe,
-- which does not serve an unread count -- that one filters on `read`.
--
-- Partial on read = false, because an unread count only ever looks at unread
-- rows and the read ones are the overwhelming majority of the table over time.
-- -----------------------------------------------------------------------------

create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read = false;
