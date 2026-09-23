"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { findExistingOneOnOne } from "@/lib/conversations";
import { useToast } from "@/components/ui/Toast";

export type ConversationParticipant = {
  id: string;
  full_name: string | null;
  role: string | null;
  trade: string | null;
  company_logo_path: string | null;
  signup_type: string | null;
};

type EmbeddedJob = { id: string; title: string };

export type ConversationSummary = {
  id: string;
  title: string | null;
  is_group: boolean;
  participants: ConversationParticipant[];
  /** conversations.job_id, resolved — the job a thread from an application is about. */
  job: { id: string; title: string } | null;
  lastMessage: { content: string; created_at: string; sender_id: string; deleted_at: string | null } | null;
  isUnread: boolean;
};

export function useConversations() {
  const toast = useToast();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  /**
   * LIVE. The list used to load once and then only on your own send, so a
   * message arriving in a different conversation changed nothing on screen —
   * no new preview, no unread dot, no reordering — until a reload. It now
   * reloads on any INSERT into messages (RLS limits delivery to threads you
   * are in) and on your own participant row changing (last_read_at when a
   * thread is opened, hidden_at when one is deleted), debounced so a burst
   * of messages is one reload. Both tables are in supabase_realtime since
   * 20260923120000.
   *
   * SILENT RELOADS. Only the first load shows the loader; later ones swap the
   * list in place, so it does not flash empty every time a message lands.
   */

  // `loading` starts true and is never set back to true: only the first
  // load shows the loader.
  const load = useCallback(async () => {

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
        job_id,
        jobs ( id, title ),
        conversation_participants ( user_id, profiles!conversation_participants_user_id_fkey ( id, full_name, role, trade, company_logo_path, signup_type ) )
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

      // A to-one embed is typed as an array and returned as an object.
      const embeddedJob = (conv as { jobs?: EmbeddedJob | EmbeddedJob[] | null }).jobs;
      const job = Array.isArray(embeddedJob) ? embeddedJob[0] ?? null : embeddedJob ?? null;

      summaries.push({
        id: conv.id,
        title: conv.title,
        is_group: conv.is_group,
        job: job ? { id: job.id, title: job.title } : null,
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
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      // First load from the callback rather than the effect body, alongside
      // the subscription that keeps it current.
      load();
      channel = supabase
        .channel(`conversation-list-${user.id}-${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, schedule)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversation_participants",
            filter: `user_id=eq.${user.id}`,
          },
          schedule
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  async function startConversation(participantIds: string[], title?: string) {
    if (!userId) return { error: "Not logged in.", conversationId: null };

    const isGroup = participantIds.length > 1;

    // For 1-on-1 chats, reuse an existing conversation with this same person instead of duplicating
    if (!isGroup) {
      const existingId = await findExistingOneOnOne(userId, participantIds[0]);
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
      toast.error(error.message);
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    toast.success("Conversation removed from your inbox.");
  }

  return { conversations, loading, userId, startConversation, deleteConversation, refresh: load };
}