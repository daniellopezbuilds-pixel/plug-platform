"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
};

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function init() {
      setLoading(true);

      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (isMounted && data) setMessages(data as Message[]);
      if (isMounted) setLoading(false);

      // Mark this conversation as read now that it's open, and unhide it for this user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString(), hidden_at: null })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id);
      }

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase
        .channel(`messages-${conversationId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (isMounted) {
              setMessages((prev) => [...prev, payload.new as Message]);
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            if (isMounted) {
              const updated = payload.new as Message;
              setMessages((prev) =>
                prev.map((m) => (m.id === updated.id ? updated : m))
              );
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    }

    init();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId]);

  async function sendMessage(content: string) {
    if (!conversationId || !content.trim()) return { error: "Nothing to send." };

    setSending(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSending(false);
      return { error: "Not logged in." };
    }

    const { error } = await supabase.from("messages").insert([
      {
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
      },
    ]);

    setSending(false);

    return { error: error?.message || null };
  }

  async function deleteMessage(messageId: string) {
    const { error } = await supabase
      .from("messages")
      .update({ content: "", deleted_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) {
      alert(error.message);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: "", deleted_at: new Date().toISOString() } : m
      )
    );
  }

  return { messages, loading, sending, sendMessage, deleteMessage };
}