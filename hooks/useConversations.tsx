"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ConversationSummary = {
  id: string;
  title: string | null;
  is_group: boolean;
  participants: { id: string; full_name: string | null; role: string | null }[];
  lastMessage: { content: string; created_at: string; sender_id: string; deleted_at: string | null } | null;
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
      .select("conversation_id, last_read_at, hidden_at")
      .eq("user_id", user.id);

    const participation = myParticipation || [];
    const convIds = participation.map((p) => p.conversation_id);

    if (convIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const lastReadMap = new Map(participation.map((p) => [p.conversation_id, p.last_read_at]));
    const hiddenAtMap = new Map(participation.map((p) => [p.conversation_id, p.hidden_at]));

    const { data: convs } = await supabase
      .from("conversations")
      .select(
        `
        id,
        title,
        is_group,
        conversation_participants ( user_id, profiles ( id, full_name, role ) )
      `
      )
      .in("id", convIds);

    const summaries: ConversationSummary[] = [];

    for (const conv of convs || []) {
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at, sender_id, deleted_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Skip conversations with no messages yet — don't show until the first message is sent
      if (!lastMsg) {
        continue;
      }

      const hiddenAt = hiddenAtMap.get(conv.id);

      // Skip this conversation if the user hid it, UNLESS a newer message has arrived since
      if (hiddenAt && new Date(lastMsg.created_at) <= new Date(hiddenAt)) {
        continue;
      }

      const lastReadAt = lastReadMap.get(conv.id);
      const isUnread = Boolean(
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
        lastMessage: lastMsg,
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

  async function findExistingOneOnOne(otherUserId: string): Promise<string | null> {
    if (!userId) return null;

    const { data: myConvs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);

    const myConvIds = (myConvs || []).map((c) => c.conversation_id);

    if (myConvIds.length === 0) return null;

    const { data: candidates } = await supabase
      .from("conversations")
      .select(
        `
        id,
        is_group,
        conversation_participants ( user_id )
        `
      )
      .in("id", myConvIds)
      .eq("is_group", false);

    for (const conv of candidates || []) {
      const participantIds = (conv.conversation_participants || []).map((p: any) => p.user_id);
      const others = participantIds.filter((id: string) => id !== userId);

      if (others.length === 1 && others[0] === otherUserId) {
        return conv.id as string;
      }
    }

    return null;
  }

  async function startConversation(participantIds: string[], title?: string) {
    if (!userId) return { error: "Not logged in.", conversationId: null };

    const isGroup = participantIds.length > 1;

    // For 1-on-1 chats, reuse an existing conversation with this same person instead of duplicating
    if (!isGroup) {
      const existingId = await findExistingOneOnOne(participantIds[0]);
      if (existingId) {
        return { error: null, conversationId: existingId };
      }
    }

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

    // Note: intentionally not calling load() here — this conversation has no
    // messages yet, so it should stay out of the list until the first message is sent.
    return { error: null, conversationId: conv.id as string };
  }

  async function deleteConversation(conversationId: string) {
    if (!userId) return;

    const { error } = await supabase
      .from("conversation_participants")
      .update({ hidden_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) {
      alert(error.message);
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
  }

  return { conversations, loading, userId, startConversation, deleteConversation, refresh: load };
}