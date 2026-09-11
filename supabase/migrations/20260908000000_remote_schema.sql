--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- ---------------------------------------------------------------------------
-- EDITED 2026-09-10 so this file can actually run. See supabase/README.md.
--
-- This started as a raw pg_dump of the whole database. That is a faithful
-- record and an unusable migration: it carried psql meta-commands, CREATE
-- SCHEMA for schemas Supabase already owns, and full definitions of the auth
-- and storage tables that Supabase's own bootstrap creates. Replaying it into
-- a fresh project failed on line 5 with 42601, and would have collided
-- repeatedly after that.
--
-- REMOVED
--   the \restrict and \unrestrict lines - psql meta-commands, not SQL
--   CREATE SCHEMA auth | public | storage - Supabase creates all three
--   COMMENT ON SCHEMA public - comes with the schema
--   auth.*    tables, types, functions, indexes, constraints, comments, RLS
--   storage.* tables, types, functions, indexes, constraints, comments, RLS
--
-- KEPT
--   everything in schema public, unchanged
--   the 14 storage.objects policies - ours, created in the dashboard
--   CREATE TRIGGER on_auth_user_created ON auth.users - ours, not Supabase's
--   the FK profiles.id -> auth.users(id) - ours
--
-- ON storage.objects RLS, removed on the second attempt
--
-- An earlier version of this edit kept ALTER TABLE storage.objects ENABLE ROW
-- LEVEL SECURITY as insurance, on the reasoning that it is idempotent and the
-- policies below are inert without it. That was wrong twice over. Supabase
-- enables RLS on that table itself, so it was redundant; and ENABLE ROW LEVEL
-- SECURITY strictly requires table ownership, which the postgres role does not
-- have on storage.objects - it is owned by supabase_storage_admin. The push
-- failed on it with 42501, as the last statement in the file.
--
-- CREATE POLICY on the same table does NOT fail. Supabase grants the postgres
-- role what it needs to manage policies there, which is what makes the
-- dashboard policy editor work. The proof is that failed push: the ALTER was
-- statement 177 and all 14 storage policies are statements 163-176, so every
-- one of them executed before it. Same for the auth.users trigger and the
-- auth.users foreign key, both far earlier in the file.
--
-- The removed objects are all recreated by Supabase before migrations run, so
-- the resulting database is the same shape. Nothing in public was touched.
--
-- STILL NOT CARRIED: storage bucket rows are data, not schema, so a fresh
-- project has no 'sponsored-listings', 'branding', 'resumes' or
-- 'employer-documents' bucket. The policies above reference buckets that do
-- not exist until someone creates them. See supabase/README.md.
-- ---------------------------------------------------------------------------
--
--
-- Name: can_message(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_message(a uuid, b uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from connections
    where status = 'accepted'
    and ((requester_id = a and recipient_id = b) or (requester_id = b and recipient_id = a))
  )
  or exists (
    select 1 from applications
    join jobs on jobs.id = applications.job_id
    where (jobs.user_id = a and applications.worker_id = b)
    or (jobs.user_id = b and applications.worker_id = a)
  );
$$;


--
-- Name: generate_profile_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_profile_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  next_number INTEGER;
BEGIN
  SELECT COUNT(*) + 1
  INTO next_number
  FROM profiles;

  NEW.profile_number :=
    'SP-' || LPAD(next_number::TEXT, 6, '0');

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name, role, xp)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'worker'),
    0
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;


--
-- Name: is_conversation_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_conversation_participant(conv_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = conv_id
      and user_id = auth.uid()
  );
$$;


--
-- Name: is_conversation_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_conversation_participant(conv_id uuid, uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = conv_id and user_id = uid
  );
$$;


--
-- Name: is_messaging_blocked(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_messaging_blocked(conv_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  my_role text;
  my_subscribed boolean;
  conv_is_group boolean;
  other_count int;
  other_is_employer boolean;
begin
  select role, coalesce(messaging_subscribed, false)
    into my_role, my_subscribed
  from profiles where id = auth.uid();

  -- Only unsubscribed workers are ever blocked.
  if my_role is distinct from 'worker' or my_subscribed then
    return false;
  end if;

  select is_group into conv_is_group
  from conversations where id = conv_id;

  -- Group chats are never blocked.
  if coalesce(conv_is_group, false) then
    return false;
  end if;

  select count(*) into other_count
  from conversation_participants
  where conversation_id = conv_id and user_id <> auth.uid();

  -- Only 1-on-1 conversations are blocked.
  if other_count <> 1 then
    return false;
  end if;

  select (p.role = 'employer') into other_is_employer
  from conversation_participants cp
  join profiles p on p.id = cp.user_id
  where cp.conversation_id = conv_id and cp.user_id <> auth.uid()
  limit 1;

  return coalesce(other_is_employer, false);
end;
$$;


--
-- Name: notify_connection_accepted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_connection_accepted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  recipient_name text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select full_name into recipient_name from profiles where id = new.recipient_id;

    insert into notifications (user_id, type, title, message, link)
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


--
-- Name: notify_new_applicant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_applicant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  job_title text;
  employer_id uuid;
begin
  select title, user_id into job_title, employer_id
  from jobs
  where id = new.job_id;

  insert into notifications (user_id, type, title, message, link)
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


--
-- Name: notify_new_connection_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_connection_request() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  requester_name text;
begin
  select full_name into requester_name from profiles where id = new.requester_id;

  insert into notifications (user_id, type, title, message, link)
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


--
-- Name: notify_new_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_job() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into notifications (user_id, type, title, message, link)
  select
    id,
    'job_match',
    'New Job Posted',
    new.title || ' at ' || coalesce(new.company, 'a company') || ' in ' || coalesce(new.location, 'your area'),
    '/dashboard/jobs'
  from profiles
  where active_role = 'worker' or account_type = 'both';

  return new;
end;
$$;


--
-- Name: notify_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  sender_name text;
  participant record;
begin
  select full_name into sender_name from profiles where id = new.sender_id;

  for participant in
    select user_id from conversation_participants
    where conversation_id = new.conversation_id and user_id != new.sender_id
  loop
    insert into notifications (user_id, type, title, message, link)
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


--
-- Name: notify_new_review(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_review() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  reviewer_name text;
begin
  select full_name into reviewer_name from profiles where id = new.reviewer_id;

  insert into notifications (user_id, type, title, message, link)
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


--
-- Name: notify_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  job_title text;
begin
  if new.status is distinct from old.status then
    select title into job_title from jobs where id = new.job_id;

    insert into notifications (user_id, type, title, message, link)
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


--
-- Name: profiles_guard_admin_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_guard_admin_escalation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  jwt_role text;
  caller   uuid;
begin
  if new.is_admin is not distinct from old.is_admin then
    return new;
  end if;

  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  if jwt_role = 'service_role' then
    return new;
  end if;

  if jwt_role is null then
    return new;
  end if;

  caller := auth.uid();

  if caller is null then
    raise exception 'Only an administrator may change is_admin.'
      using errcode = '42501';
  end if;

  if not coalesce(
    (select p.is_admin from public.profiles p where p.id = caller),
    false
  ) then
    raise exception 'Only an administrator may change is_admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION profiles_guard_admin_escalation(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.profiles_guard_admin_escalation() IS 'Blocks is_admin changes from non-admin callers. Required because the "Users can update own profile" RLS policy restricts rows but not columns, which made is_admin self-assignable. See supabase/fix-admin-escalation.sql.';


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    trade text,
    xp bigint
);


--
-- Name: Workers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workers ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."Workers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    worker_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'Pending'::text
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: conversation_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now(),
    hidden_at timestamp with time zone,
    payment_status text
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_group boolean DEFAULT false,
    title text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: employer_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employer_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text NOT NULL,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: general_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submitted_by uuid NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT general_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text,
    location text,
    pay text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company text,
    required_union_status text
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    link text,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_reactions_reaction_type_check CHECK ((reaction_type = ANY (ARRAY['like'::text, 'celebrate'::text, 'support'::text, 'insightful'::text])))
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    post_type text DEFAULT 'status'::text NOT NULL,
    content text NOT NULL,
    job_title text,
    job_location text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT posts_post_type_check CHECK ((post_type = ANY (ARRAY['status'::text, 'job'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text,
    username text,
    trade text,
    xp bigint DEFAULT '0'::bigint,
    bio text,
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'worker'::text,
    profile_number text,
    account_type text DEFAULT 'both'::text,
    active_role text DEFAULT 'worker'::text,
    union_status text,
    union_verified boolean DEFAULT false,
    location text,
    years_experience integer,
    resume_path text,
    company_logo_path text,
    company_banner_path text,
    company_description text,
    company_website text,
    employer_verified boolean DEFAULT false,
    is_admin boolean DEFAULT false NOT NULL,
    messaging_subscribed boolean DEFAULT false NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    reviewee_id uuid NOT NULL,
    rating integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: sponsored_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sponsored_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    image_path text NOT NULL,
    link_url text,
    placement text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'approved'::text NOT NULL,
    submitted_by uuid,
    start_date date,
    end_date date,
    is_paid_ad boolean DEFAULT false NOT NULL,
    payment_status text DEFAULT 'n/a'::text NOT NULL,
    amount_charged numeric,
    city text,
    review_notes text,
    source text DEFAULT 'internal'::text,
    CONSTRAINT sponsored_listings_payment_status_check CHECK ((payment_status = ANY (ARRAY['n/a'::text, 'unpaid'::text, 'paid'::text]))),
    CONSTRAINT sponsored_listings_placement_check CHECK ((placement = ANY (ARRAY['jobs_board'::text, 'marketplace'::text, 'feed'::text]))),
    CONSTRAINT sponsored_listings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: workers Workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT "Workers_pkey" PRIMARY KEY (id);


--
-- Name: sponsored_listings ads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_listings
    ADD CONSTRAINT ads_pkey PRIMARY KEY (id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
-- Name: conversation_participants conversation_participants_conversation_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);


--
-- Name: conversation_participants conversation_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: employer_documents employer_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_documents
    ADD CONSTRAINT employer_documents_pkey PRIMARY KEY (id);


--
-- Name: general_requests general_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_requests
    ADD CONSTRAINT general_requests_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (id);


--
-- Name: post_reactions post_reactions_post_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_user_id_key UNIQUE (post_id, user_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_application_id_reviewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_application_id_reviewer_id_key UNIQUE (application_id, reviewer_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: applications unique_job_worker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT unique_job_worker UNIQUE (job_id, worker_id);


--
-- Name: unique_connection_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_connection_pair ON public.connections USING btree (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id));


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: connections on_connection_accepted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_connection_accepted AFTER UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.notify_connection_accepted();


--
-- Name: applications on_new_application; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_application AFTER INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.notify_new_applicant();


--
-- Name: connections on_new_connection_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_connection_request AFTER INSERT ON public.connections FOR EACH ROW EXECUTE FUNCTION public.notify_new_connection_request();


--
-- Name: jobs on_new_job; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_job AFTER INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.notify_new_job();


--
-- Name: messages on_new_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


--
-- Name: reviews on_new_review; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_review AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.notify_new_review();


--
-- Name: applications on_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_status_change AFTER UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.notify_status_change();


--
-- Name: profiles profiles_guard_admin_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_guard_admin_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_admin_escalation();


--
-- Name: profiles set_profile_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profile_number BEFORE INSERT ON public.profiles FOR EACH ROW WHEN ((new.profile_number IS NULL)) EXECUTE FUNCTION public.generate_profile_number();


--
-- Name: applications applications_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);


--
-- Name: applications applications_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.profiles(id);


--
-- Name: connections connections_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: connections connections_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_participants conversation_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: employer_documents employer_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employer_documents
    ADD CONSTRAINT employer_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: general_requests general_requests_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_requests
    ADD CONSTRAINT general_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reactions post_reactions_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reactions post_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reactions
    ADD CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: posts posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_reviewee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES public.profiles(id);


--
-- Name: reviews reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.profiles(id);


--
-- Name: sponsored_listings sponsored_listings_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sponsored_listings
    ADD CONSTRAINT sponsored_listings_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: sponsored_listings Admins can delete ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete ads" ON public.sponsored_listings FOR DELETE USING (public.is_admin());


--
-- Name: general_requests Admins can delete general requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete general requests" ON public.general_requests FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: sponsored_listings Admins can insert ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert ads" ON public.sponsored_listings FOR INSERT WITH CHECK ((public.is_admin() OR ((submitted_by = auth.uid()) AND (status = 'pending'::text))));


--
-- Name: sponsored_listings Admins can update ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update ads" ON public.sponsored_listings FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: profiles Admins can update any profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.is_admin = true)))));


--
-- Name: general_requests Admins can update general requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update general requests" ON public.general_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: employer_documents Admins can view all employer documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all employer documents" ON public.employer_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));


--
-- Name: post_comments Anyone authenticated can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view comments" ON public.post_comments FOR SELECT TO authenticated USING (true);


--
-- Name: posts Anyone authenticated can view posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view posts" ON public.posts FOR SELECT TO authenticated USING (true);


--
-- Name: post_reactions Anyone authenticated can view reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can view reactions" ON public.post_reactions FOR SELECT TO authenticated USING (true);


--
-- Name: sponsored_listings Anyone can view active ads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active ads" ON public.sponsored_listings FOR SELECT USING ((((is_active = true) AND (status = 'approved'::text)) OR public.is_admin() OR (submitted_by = auth.uid())));


--
-- Name: reviews Anyone can view reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view reviews" ON public.reviews FOR SELECT USING (true);


--
-- Name: profiles Authenticated users can view profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: applications Employers can update applicants to their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers can update applicants to their jobs" ON public.applications FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = applications.job_id) AND (jobs.user_id = auth.uid())))));


--
-- Name: applications Employers can view applicants to their jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Employers can view applicants to their jobs" ON public.applications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = applications.job_id) AND (jobs.user_id = auth.uid())))));


--
-- Name: workers Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.workers FOR SELECT USING (true);


--
-- Name: jobs Everyone can view jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view jobs" ON public.jobs FOR SELECT TO authenticated USING (true);


--
-- Name: employer_documents Owners manage their own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners manage their own documents" ON public.employer_documents USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: reviews Participants can review after acceptance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can review after acceptance" ON public.reviews FOR INSERT WITH CHECK (((reviewer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.applications
     JOIN public.jobs ON ((jobs.id = applications.job_id)))
  WHERE ((applications.id = reviews.application_id) AND (applications.status = 'accepted'::text) AND (((auth.uid() = applications.worker_id) AND (reviews.reviewee_id = jobs.user_id)) OR ((auth.uid() = jobs.user_id) AND (reviews.reviewee_id = applications.worker_id))))))));


--
-- Name: messages Participants can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND public.is_conversation_participant(conversation_id) AND (NOT public.is_messaging_blocked(conversation_id))));


--
-- Name: messages Participants can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT USING (public.is_conversation_participant(conversation_id, auth.uid()));


--
-- Name: conversation_participants Participants can view participant lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view participant lists" ON public.conversation_participants FOR SELECT USING (public.is_conversation_participant(conversation_id, auth.uid()));


--
-- Name: conversations Participants can view their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view their conversations" ON public.conversations FOR SELECT USING ((public.is_conversation_participant(id, auth.uid()) OR (created_by = auth.uid())));


--
-- Name: connections Recipients can respond to requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Recipients can respond to requests" ON public.connections FOR UPDATE USING ((auth.uid() = recipient_id));


--
-- Name: connections Requesters can cancel pending requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Requesters can cancel pending requests" ON public.connections FOR DELETE USING (((auth.uid() = requester_id) AND (status = 'pending'::text)));


--
-- Name: messages Senders can delete own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders can delete own messages" ON public.messages FOR UPDATE TO authenticated USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: conversation_participants Users can add eligible participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add eligible participants" ON public.conversation_participants FOR INSERT WITH CHECK (((user_id = auth.uid()) OR public.can_message(( SELECT conversations.created_by
   FROM public.conversations
  WHERE (conversations.id = conversation_participants.conversation_id)), user_id)));


--
-- Name: conversations Users can create conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT WITH CHECK ((created_by = auth.uid()));


--
-- Name: jobs Users can create jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: post_comments Users can delete own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own comments" ON public.post_comments FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.is_admin()));


--
-- Name: posts Users can delete own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.is_admin()));


--
-- Name: post_reactions Users can delete own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own reactions" ON public.post_reactions FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));


--
-- Name: post_comments Users can insert own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own comments" ON public.post_comments FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));


--
-- Name: general_requests Users can insert own general requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own general requests" ON public.general_requests FOR INSERT TO authenticated WITH CHECK ((submitted_by = auth.uid()));


--
-- Name: posts Users can insert own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own posts" ON public.posts FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));


--
-- Name: post_reactions Users can insert own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own reactions" ON public.post_reactions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: employer_documents Users can insert their own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own documents" ON public.employer_documents FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: connections Users can send connection requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send connection requests" ON public.connections FOR INSERT WITH CHECK ((auth.uid() = requester_id));


--
-- Name: conversation_participants Users can update own participant row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own participant row" ON public.conversation_participants FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: post_reactions Users can update own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own reactions" ON public.post_reactions FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: general_requests Users can view own general requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own general requests" ON public.general_requests FOR SELECT TO authenticated USING (((submitted_by = auth.uid()) OR public.is_admin()));


--
-- Name: connections Users can view their own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own connections" ON public.connections FOR SELECT USING (((auth.uid() = requester_id) OR (auth.uid() = recipient_id)));


--
-- Name: employer_documents Users can view their own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own documents" ON public.employer_documents FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: applications Workers can apply; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workers can apply" ON public.applications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = worker_id));


--
-- Name: applications Workers can view applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Workers can view applications" ON public.applications FOR SELECT TO authenticated USING ((auth.uid() = worker_id));


--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: employer_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employer_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: general_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.general_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: post_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: post_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: sponsored_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sponsored_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles users insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: workers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Admin delete access 1p2pdvn_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin delete access 1p2pdvn_0" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'sponsored-listings'::text) AND public.is_admin()));


--
-- Name: objects Admin delete access 1p2pdvn_1; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin delete access 1p2pdvn_1" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'sponsored-listings'::text) AND public.is_admin()));


--
-- Name: objects Admin insert access 1p2pdvn_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin insert access 1p2pdvn_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'sponsored-listings'::text) AND public.is_admin()));


--
-- Name: objects Admin update access 1p2pdvn_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin update access 1p2pdvn_0" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'sponsored-listings'::text) AND public.is_admin()));


--
-- Name: objects Admin update access 1p2pdvn_1; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Admin update access 1p2pdvn_1" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'sponsored-listings'::text) AND public.is_admin()));


--
-- Name: objects Anyone can view branding files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Anyone can view branding files" ON storage.objects FOR SELECT USING ((bucket_id = 'branding'::text));


--
-- Name: objects Eligible users can view resumes; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Eligible users can view resumes" ON storage.objects FOR SELECT USING (((bucket_id = 'resumes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR public.can_message(((storage.foldername(name))[1])::uuid, auth.uid()))));


--
-- Name: objects Owners manage their own branding files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owners manage their own branding files" ON storage.objects USING (((bucket_id = 'branding'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'branding'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Owners manage their own employer documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Owners manage their own employer documents" ON storage.objects USING (((bucket_id = 'employer-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'employer-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Public read access 1p2pdvn_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public read access 1p2pdvn_0" ON storage.objects FOR SELECT USING ((bucket_id = 'sponsored-listings'::text));


--
-- Name: objects Workers can delete their own resume; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Workers can delete their own resume" ON storage.objects FOR DELETE USING (((bucket_id = 'resumes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Workers can update their own resume; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Workers can update their own resume" ON storage.objects FOR UPDATE USING (((bucket_id = 'resumes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects Workers can upload their own resume; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Workers can upload their own resume" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'resumes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


--
-- Name: objects authenticated users upload ad images; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "authenticated users upload ad images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'sponsored-listings'::text));
