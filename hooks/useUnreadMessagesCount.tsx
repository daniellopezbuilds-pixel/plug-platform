"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useUnreadMessagesCount() {
  const [count, setCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: participation } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at")
        .eq("user_id", user.id);

      const rows = participation || [];

      if (rows.length === 0) {
        if (isMounted) setCount(0);
        return;
      }

      let unread = 0;

      for (const row of rows) {
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("sender_id, created_at")
          .eq("conversation_id", row.conversation_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMsg && lastMsg.sender_id !== user.id) {
          if (!row.last_read_at || new Date(lastMsg.created_at) > new Date(row.last_read_at)) {
            unread++;
          }
        }
      }

      if (isMounted) setCount(unread);
    }

    load();

    async function setupSubscription() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || channelRef.current) return;

      const channel = supabase
        .channel(`unread-messages-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => {
            load();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "conversation_participants",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            load();
          }
        )
        .subscribe();

      channelRef.current = channel;
    }

    setupSubscription();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return count;
}