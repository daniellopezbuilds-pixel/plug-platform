-- =============================================================================
-- Pin search_path on the remaining baseline functions
--
-- Follow-up to 20260910120000, which fixed generate_profile_number() during the
-- signup outage. This does the same thing to the other nine functions that
-- carry the same defect, none of which sits in a signup's call path.
--
-- Status: NOT APPLIED. Nothing here is urgent -- these are latent, not broken.
--
--
-- THE DEFECT
--
-- A function with no `SET search_path` of its own runs with whatever the caller
-- has. That is fine while every caller happens to have 'public' in scope, and
-- it stops being fine the moment a caller pins an empty search_path -- which is
-- exactly what a SECURITY DEFINER function is supposed to do.
--
-- That is how signups broke on 2026-09-10: handle_new_user() was hardened to
-- `search_path = ''`, and the set_profile_number trigger it fires inherited the
-- empty path and could no longer resolve `profiles`. The error surfaced from
-- handle_new_user(), one level above the actual cause.
--
-- Every function below is SECURITY DEFINER, so an unpinned search_path is also
-- the classic privilege-escalation shape in its own right: a caller who can set
-- search_path chooses which `notifications` table the definer writes to.
--
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
--
-- For each function: add `set search_path = ''`, and schema-qualify every table
-- reference. Logic, signatures, return types, volatility and SECURITY DEFINER
-- are all preserved exactly. Some joins gain short aliases purely so the
-- qualified names stay readable.
--
-- `create or replace` preserves the function OID, so the RLS policies that call
-- can_message() and is_conversation_participant() keep working across this
-- change with no policy edits.
--
-- The one exception is notify_new_job(), which drops a clause that is already
-- dead. See the note above it -- the behaviour change happened in
-- 20260909120000, not here.
--
--
-- NOT COVERED
--
-- is_conversation_participant(uuid) -- the ONE-argument overload -- already has
-- `SET search_path TO 'public'` and is not touched. Only the two-argument
-- overload below is unpinned. Do not collapse them.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. can_message(uuid, uuid)
--
-- Called from the "Users can add eligible participants" policy on
-- conversation_participants and the "Eligible users can view resumes" storage
-- policy. Aliased below because the parameters are already named a and b.
-- -----------------------------------------------------------------------------

create or replace function public.can_message(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.recipient_id = b)
        or (c.requester_id = b and c.recipient_id = a))
  )
  or exists (
    select 1
    from public.applications ap
    join public.jobs j on j.id = ap.job_id
    where (j.user_id = a and ap.worker_id = b)
       or (j.user_id = b and ap.worker_id = a)
  );
$$;


-- -----------------------------------------------------------------------------
-- 2. is_conversation_participant(uuid, uuid)
--
-- The two-argument overload only. The one-argument version is already pinned.
-- -----------------------------------------------------------------------------

create or replace function public.is_conversation_participant(conv_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conv_id and cp.user_id = uid
  );
$$;


-- -----------------------------------------------------------------------------
-- 3. notify_connection_accepted()  -- trigger on connections
-- -----------------------------------------------------------------------------

create or replace function public.notify_connection_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_name text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select full_name into recipient_name
    from public.profiles where id = new.recipient_id;

    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.requester_id,
      'connection_accepted',
      'Connection Accepted',
      coalesce(recipient_name, 'Someone') || ' accepted your connection request',
      '/dashboard/marketplace'
    );
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. notify_new_applicant()  -- trigger on applications
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_title text;
  employer_id uuid;
begin
  select title, user_id into job_title, employer_id
  from public.jobs
  where id = new.job_id;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    employer_id,
    'new_applicant',
    'New Applicant',
    'Someone applied to "' || job_title || '"',
    '/dashboard/applicants'
  );

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. notify_new_connection_request()  -- trigger on connections
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_connection_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_name text;
begin
  select full_name into requester_name
  from public.profiles where id = new.requester_id;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    new.recipient_id,
    'connection_request',
    'New Connection Request',
    coalesce(requester_name, 'Someone') || ' wants to connect with you',
    '/dashboard/marketplace'
  );

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. notify_new_job()  -- trigger on jobs
--
-- READ THIS ONE. The original selected recipients with:
--
--   where active_role = 'worker' or account_type = 'both'
--
-- `account_type = 'both'` was true for EVERY row, because 'both' is the column
-- default and nothing ever wrote over it. So the or-clause matched everyone and
-- every new job notified every user on the platform, employers included.
--
-- 20260909120000 re-valued account_type to 'company' | 'individual' | 'brand'.
-- From that moment `account_type = 'both'` matches nothing, the or-clause is
-- dead, and the audience silently narrowed to `active_role = 'worker'`.
--
-- THE BEHAVIOUR ALREADY CHANGED. Dropping the clause here changes nothing --
-- it is removing a branch that can no longer be true, so the next person to
-- read this does not have to work out what 'both' meant.
--
-- Whether "everyone in worker mode" is the right audience is a product
-- question, not a schema one, and it is now genuinely open: under the
-- both-modes decision in spec section 2, every non-brand account can sit in
-- worker mode. Notifying on active_role is at least coherent -- it means "you
-- are looking at the worker dashboard" -- but it was never deliberately
-- chosen. Worth deciding before the next round of notification work.
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, title, message, link)
  select
    id,
    'job_match',
    'New Job Posted',
    new.title || ' at ' || coalesce(new.company, 'a company')
      || ' in ' || coalesce(new.location, 'your area'),
    '/dashboard/jobs'
  from public.profiles
  where active_role = 'worker';

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7. notify_new_message()  -- trigger on messages
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
  participant record;
begin
  select full_name into sender_name
  from public.profiles where id = new.sender_id;

  for participant in
    select user_id from public.conversation_participants
    where conversation_id = new.conversation_id
      and user_id != new.sender_id
  loop
    insert into public.notifications (user_id, type, title, message, link)
    values (
      participant.user_id,
      'new_message',
      'New Message',
      coalesce(sender_name, 'Someone') || ' sent you a message',
      '/dashboard/messages'
    );
  end loop;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. notify_new_review()  -- trigger on reviews
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_name text;
begin
  select full_name into reviewer_name
  from public.profiles where id = new.reviewer_id;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    new.reviewee_id,
    'new_review',
    'New Review',
    coalesce(reviewer_name, 'Someone') || ' left you a review',
    '/dashboard/profile'
  );

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 9. notify_status_change()  -- trigger on applications
-- -----------------------------------------------------------------------------

create or replace function public.notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_title text;
begin
  if new.status is distinct from old.status then
    select title into job_title from public.jobs where id = new.job_id;

    insert into public.notifications (user_id, type, title, message, link)
    values (
      new.worker_id,
      'status_change',
      'Application Update',
      'Your application for "' || job_title || '" is now ' || new.status,
      '/dashboard/applications'
    );
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- Verify
--
-- Every public function should now report a pinned search_path. Expect zero
-- rows, except is_conversation_participant(uuid) and the other pre-pinned ones
-- which use 'public' rather than '' -- both are pinned, which is what matters.
--
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) as args,
--          p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proconfig is null
--   order by 1;
--
-- Then exercise the paths these sit on, because a trigger that raises will
-- abort the statement that fired it:
--
--   * send a message              -> notify_new_message, can_message
--   * post a job                  -> notify_new_job
--   * apply to a job              -> notify_new_applicant
--   * change an application state -> notify_status_change
--   * send and accept a connection request
--   * leave a review
-- -----------------------------------------------------------------------------
