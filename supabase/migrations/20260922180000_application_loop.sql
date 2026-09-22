-- =============================================================================
-- The application loop: better notifications, email, and a job on a thread
--
-- WHAT WAS ACTUALLY MISSING, because it is less than it looked. In-app
-- notifications for application events ALREADY EXIST and their triggers are
-- already attached — on_new_application and on_status_change, both in the
-- baseline. Staging has nine new_applicant and eight status_change rows that
-- fired on their own. What did not exist:
--
--   1. EMAIL. The outbox had exactly one template, license_claim_attempt.
--      Nothing about an application has ever reached an inbox, so a decision
--      only arrives if you happen to log in.
--   2. A NAME. "Someone applied to X" — the employer could not tell whether
--      that was one person or the fourth today, and the notification named
--      nobody.
--   3. RESTRAINT. notify_status_change fired on ANY status change, so moving an
--      application back to pending told the applicant their application "is now
--      pending", which is not news and reads like a rejection.
--   4. A JOB ON A CONVERSATION. conversations has id, is_group, title,
--      created_by, created_at and nothing else. Two people could talk with no
--      record of which job it was about.
--
-- This file fixes 1-4. The two triggers are NOT re-created; they already point
-- at these function names and replacing the functions is enough.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. conversations.job_id -- what the thread is about
--
-- ON DELETE SET NULL, NOT CASCADE. Deleting a job must not delete a
-- conversation: the thread is correspondence between two people and it keeps
-- its meaning after the posting comes down. The banner simply stops showing a
-- job.
--
-- NULLABLE, and most rows will stay null — every conversation started from the
-- marketplace or a connection has no job behind it, and so does every one of
-- the three that already exist.
--
-- WHY THE JOB IS ON THE CONVERSATION AND NOT IN A FIRST MESSAGE. The obvious
-- implementation of "the first message should carry the job reference" is to
-- insert one, and it does not survive contact with this schema: the
-- "Participants can send messages" policy ends in
-- `NOT public.is_messaging_blocked(conversation_id)`, and that function blocks
-- an unsubscribed WORKER from sending to an employer. The worker is exactly the
-- party who clicks Message from their own application card, so the opening
-- message would be refused for the half of the cases it matters most in, and
-- the thread would open with no context at all.
--
-- A column is also better than a message on its own terms: it cannot be
-- deleted by either party, it does not scroll away above a hundred replies, and
-- it can be queried -- "every conversation about this job" is a where clause
-- rather than a text search.
--
-- MUTABLE, meaning "the job this thread is currently about". The messaging UI
-- reuses one conversation per pair (findExistingOneOnOne in
-- hooks/useConversations.tsx), so the same employer and electrician discussing
-- a second job reuse the thread. Pointing job_id at the job most recently
-- opened from keeps the banner truthful; freezing it at the first would leave
-- the header naming a job neither of them is talking about any more.
-- -----------------------------------------------------------------------------

alter table public.conversations
  add column if not exists job_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_job_id_fkey'
  ) then
    alter table public.conversations
      add constraint conversations_job_id_fkey
      foreign key (job_id) references public.jobs (id) on delete set null;
  end if;
end;
$$;

comment on column public.conversations.job_id is
  'The job this thread is about, or NULL. Set when a conversation is opened '
  'from an applicant or application card, and re-pointed if the same two '
  'people later open one from a different job -- the messaging UI keeps one '
  'thread per pair, so this means "currently about" rather than "started '
  'from". ON DELETE SET NULL: taking a job down must not delete the '
  'correspondence about it.';

-- Answers "every conversation about this job". Partial, because the column is
-- null on every conversation that did not come from a job and there is no
-- query that wants those.
create index if not exists conversations_job_id_idx
  on public.conversations (job_id)
  where job_id is not null;


-- -----------------------------------------------------------------------------
-- 2. notify_new_applicant -- name the applicant, and queue an email
--
-- The trigger (on_new_application, AFTER INSERT ON applications) is unchanged
-- and still points here.
--
-- NAMES THE APPLICANT. "Daniel Lopez applied to Journeyman Electrician" is a
-- different message from "Someone applied" -- it is the difference between a
-- notification an employer acts on and one they clear.
--
-- FALLS BACK TO "Someone" rather than to an empty string, because full_name is
-- nullable on profiles and 'Someone applied to "X"' is still a true sentence.
--
-- THE EMAIL IS QUEUED IN THE SAME TRANSACTION as the notification, so an
-- application cannot produce one without the other. Delivery is somebody
-- else's job -- /api/email/drain, nudged by the client and run daily from
-- vercel.json as the backstop.
-- -----------------------------------------------------------------------------

create or replace function public.notify_new_applicant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_title       text;
  employer_id     uuid;
  employer_email  text;
  employer_name   text;
  applicant_name  text;
begin
  select j.title, j.user_id into job_title, employer_id
  from public.jobs j
  where j.id = new.job_id;

  if employer_id is null then
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'Someone')
    into applicant_name
  from public.profiles p
  where p.id = new.worker_id;

  applicant_name := coalesce(applicant_name, 'Someone');

  insert into public.notifications (user_id, type, title, message, link)
  values (
    employer_id,
    'new_applicant',
    'New applicant',
    applicant_name || ' applied to "' || coalesce(job_title, 'your job') || '"',
    '/dashboard/applicants'
  );

  select p.email, p.full_name into employer_email, employer_name
  from public.profiles p
  where p.id = employer_id;

  -- No address, no row. An outbox entry that can never be delivered is a
  -- permanent failure the drain retries until it hits its attempt cap.
  if nullif(btrim(coalesce(employer_email, '')), '') is not null then
    insert into public.email_outbox (to_email, subject, template, payload)
    values (
      employer_email,
      applicant_name || ' applied to "' || coalesce(job_title, 'your job') || '"',
      'application_received',
      jsonb_build_object(
        'full_name', employer_name,
        'applicant_name', applicant_name,
        'job_title', job_title
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_new_applicant() is
  'Notifies and emails the employer when someone applies to their job. Names '
  'the applicant, falling back to "Someone" when the profile has no name. '
  'Queues the email in the same transaction as the notification, so an '
  'application cannot produce one without the other.';


-- -----------------------------------------------------------------------------
-- 3. notify_status_change -- only decisions, and email them
--
-- The trigger (on_status_change, AFTER UPDATE ON applications) is unchanged.
--
-- ACCEPTED AND REJECTED ONLY. It used to fire on every status change, so an
-- employer reopening an application told the applicant it "is now pending" --
-- which reads, to somebody waiting on an answer, like a decision. Those are the
-- only two states that are news; anything else is bookkeeping.
--
-- NO EMAIL WITHOUT THE NOTIFICATION, and both inside the UPDATE's transaction.
-- A rejection email that arrives when the rollback took the status change with
-- it is the worst possible failure here.
-- -----------------------------------------------------------------------------

create or replace function public.notify_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_title     text;
  worker_email  text;
  worker_name   text;
  headline      text;
  body          text;
  subject       text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select j.title into job_title
  from public.jobs j
  where j.id = new.job_id;

  job_title := coalesce(job_title, 'a job');

  if new.status = 'accepted' then
    headline := 'You got the job';
    body := 'Your application for "' || job_title
         || '" was accepted. Message the employer to sort out the details.';
    subject := 'You were accepted for "' || job_title || '"';
  else
    headline := 'Application not successful';
    body := 'Your application for "' || job_title
         || '" was not successful this time.';
    subject := 'Update on your application for "' || job_title || '"';
  end if;

  insert into public.notifications (user_id, type, title, message, link)
  values (
    new.worker_id,
    'status_change',
    headline,
    body,
    '/dashboard/applications'
  );

  select p.email, p.full_name into worker_email, worker_name
  from public.profiles p
  where p.id = new.worker_id;

  if nullif(btrim(coalesce(worker_email, '')), '') is not null then
    insert into public.email_outbox (to_email, subject, template, payload)
    values (
      worker_email,
      subject,
      'application_decision',
      jsonb_build_object(
        'full_name', worker_name,
        'job_title', job_title,
        'status', new.status
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_status_change() is
  'Notifies and emails an applicant when their application is accepted or '
  'rejected. DECISIONS ONLY -- a move back to pending is bookkeeping, and '
  'telling somebody waiting on an answer that their application "is now '
  'pending" reads as one.';
