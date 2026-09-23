"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Who is in the open thread, and what it is about — enough to draw the thread
 * header and the context panel beside it.
 */
export type ThreadParticipant = {
  id: string;
  full_name: string | null;
  role: string | null;
  profile_number: string | null;
  trade: string | null;
  classification: string | null;
  location: string | null;
  years_experience: string | null;
  company_logo_path: string | null;
  employer_verified: boolean | null;
  union_status: string | null;
  union_verified: boolean | null;
  signup_type: string | null;
};

export type ThreadJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  pay: string | null;
  pay_rate_min: number | string | null;
  pay_rate_max: number | string | null;
  pay_unit: string | null;
  /** The employer who posted it — decides which side of the hire you are on. */
  user_id: string;
};

export type ParticipantInfo = {
  is_group: boolean;
  participants: ThreadParticipant[];
  /**
   * The job this thread is about, or null.
   *
   * Fetched here rather than by a separate hook because it comes from the same
   * conversations row that is already being read for the participants — one
   * embed instead of a second round trip per thread opened.
   */
  job: ThreadJob | null;
  /**
   * Where the application behind a job thread stands, when there is one and
   * the viewer may read it — the applicant (own application) or the employer
   * (an application to their job). Anyone else gets null from RLS, which is
   * the right answer for them too.
   */
  application: { status: string; created_at: string } | null;
};

const PARTICIPANT_COLUMNS =
  "id, full_name, role, profile_number, trade, classification, location, years_experience, company_logo_path, employer_verified, union_status, union_verified, signup_type";

export function useConversationParticipants(conversationId: string | null) {
  const [info, setInfo] = useState<ParticipantInfo | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setInfo(null);
      return;
    }

    let isMounted = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("conversations")
        .select(
          `
          is_group,
          job_id,
          jobs ( id, title, company, location, pay, pay_rate_min, pay_rate_max, pay_unit, user_id ),
          conversation_participants ( user_id, profiles!conversation_participants_user_id_fkey ( ${PARTICIPANT_COLUMNS} ) )
        `
        )
        .eq("id", conversationId)
        .maybeSingle();

      if (!isMounted || !data) return;

      // PostgREST types a to-one embed as an array and the client returns an
      // object; normalised here so callers see one shape.
      const embedded = (data as any).jobs;
      const job: ThreadJob | null = Array.isArray(embedded)
        ? embedded[0] ?? null
        : embedded ?? null;

      const participants: ThreadParticipant[] = (data.conversation_participants || [])
        .map((p: any) => p.profiles)
        .filter((p: any) => p && p.id !== user.id);

      // The applicant is whichever side did not post the job.
      let application: ParticipantInfo["application"] = null;
      if (job && !data.is_group && participants.length === 1) {
        const workerId = job.user_id === user.id ? participants[0].id : user.id;
        const { data: app } = await supabase
          .from("applications")
          .select("status, created_at")
          .eq("job_id", job.id)
          .eq("worker_id", workerId)
          .maybeSingle();
        application = app ?? null;
      }

      if (!isMounted) return;

      setInfo({ is_group: data.is_group, participants, job, application });
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [conversationId]);

  return info;
}
