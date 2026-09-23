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
        .select("conversation_id, last_read_at, hidden_at")
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

        // A conversation deleted from the inbox is not in the list, so it must
        // not be in the badge either — unless a message arrived after it was
        // hidden, which is exactly when useConversations brings it back.
        const hiddenSince = row.hidden_at && lastMsg && new Date(lastMsg.created_at) <= new Date(row.hidden_at);

        if (lastMsg && lastMsg.sender_id !== user.id && !hiddenSince) {
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

      // Checked AFTER the await, not only before it. getUser() is a network
      // call, and a component that unmounts while it is in flight has already
      // run its cleanup — which found no channel to remove. Subscribing now
      // would leave a channel nothing will ever close, still recounting on
      // every message. The dashboard's attention card mounts this and
      // unmounts on every navigation away, so the race was routine.
      if (!user || !isMounted || channelRef.current) return;

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