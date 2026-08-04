"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ParticipantInfo = {
  is_group: boolean;
  participants: { id: string; full_name: string | null; role: string | null }[];
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
          conversation_participants ( user_id, profiles ( id, full_name, role ) )
        `
        )
        .eq("id", conversationId)
        .maybeSingle();

      if (!isMounted || !data) return;

      setInfo({
        is_group: data.is_group,
        participants: (data.conversation_participants || [])
          .map((p: any) => p.profiles)
          .filter((p: any) => p && p.id !== user.id),
      });
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [conversationId]);

  return info;
}