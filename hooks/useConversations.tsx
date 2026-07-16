"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ConversationSummary = {
  id: string;
  title: string | null;
  is_group: boolean;
  participants: { id: string; full_name: string | null }[];
  lastMessage: { content: string; created_at: string; sender_id: string } | null;
  isUnread: boolean;
};

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const { data: myParticipation } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    const participation = myParticipation || [];
    const convIds = participation.map((p) => p.conversation_id);

    if (convIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const lastReadMap = new Map(participation.map((p) => [p.conversation_id, p.last_read_at]));

    const { data: convs } = await supabase
      .from("conversations")
      .select(
        `
        id,
        title,
        is_group,
        conversation_participants ( user_id, profiles ( id, full_name ) )
      `
      )
      .in("id", convIds);

    const summaries: ConversationSummary[] = [];

    for (const conv of convs || []) {
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at, sender_id")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastReadAt = lastReadMap.get(conv.id);
      const isUnread = Boolean(
        lastMsg &&
        lastMsg.sender_id !== user.id &&
        (!lastReadAt || new Date(lastMsg.created_at) > new Date(lastReadAt))
      );

      summaries.push({
        id: conv.id,
        title: conv.title,
        is_group: conv.is_group,
        participants: (conv.conversation_participants || [])
          .map((p: any) => p.profiles)
          .filter((p: any) => p && p.id !== user.id),
        lastMessage: lastMsg || null,
        isUnread,
      });
    }

    summaries.sort((a, b) => {
      const at = a.lastMessage?.created_at || "";
      const bt = b.lastMessage?.created_at || "";
      return bt.localeCompare(at);
    });

    setConversations(summaries);
    setLoading(false);
  }

  async function startConversation(participantIds: string[], title?: string) {
    if (!userId) return { error: "Not logged in.", conversationId: null };

    const isGroup = participantIds.length > 1;

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert([{ created_by: userId, is_group: isGroup, title: title || null }])
      .select()
      .single();

    if (convError || !conv) {
      return { error: convError?.message || "Failed to create conversation.", conversationId: null };
    }

    const rows = [userId, ...participantIds].map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
    }));

    const { error: participantsError } = await supabase
      .from("conversation_participants")
      .insert(rows);

    if (participantsError) {
      return { error: participantsError.message, conversationId: null };
    }

    await load();
    return { error: null, conversationId: conv.id as string };
  }

  return { conversations, loading, userId, startConversation, refresh: load };
}