"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ParticipantInfo = {
  is_group: boolean;
  participants: { id: string; full_name: string | null; role: string | null }[];
  /**
   * The job this thread is about, or null.
   *
   * Fetched here rather than by a separate hook because it comes from the same
   * conversations row that is already being read for the participants — one
   * embed instead of a second round trip per thread opened.
   */
  job: { id: string; title: string } | null;
};

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
          jobs ( id, title ),
          conversation_participants ( user_id, profiles ( id, full_name, role ) )
        `
        )
        .eq("id", conversationId)
        .maybeSingle();

      if (!isMounted || !data) return;

      // PostgREST types a to-one embed as an array and the client returns an
      // object; normalised here so callers see one shape.
      const embedded = (data as any).jobs;
      const job = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null;

      setInfo({
        is_group: data.is_group,
        participants: (data.conversation_participants || [])
          .map((p: any) => p.profiles)
          .filter((p: any) => p && p.id !== user.id),
        job: job ? { id: job.id, title: job.title } : null,
      });
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [conversationId]);

  return info;
}