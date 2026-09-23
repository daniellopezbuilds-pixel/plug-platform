"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
};

/**
 * 30: two or three screens of chat, so most conversations open complete.
 */
const PAGE_SIZE = 30;

/**
 * A conversation thread.
 *
 * THE ONE LIST THAT PAGES UPWARDS, which is why it does not use
 * usePagedList. Every other list here is newest-first and grows downwards as
 * you scroll; a chat is oldest-first on screen and grows UPWARDS, and the page
 * you want on open is the NEWEST one. So the query is ordered descending,
 * takes the newest PAGE_SIZE, and is reversed for display — and loadOlder()
 * prepends rather than appends.
 *
 * It used to select every message in the conversation with no limit at all.
 */
export function useMessages(conversationId: string | null) {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
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

      // Newest first, then reversed: "the last 30" cannot be expressed as an
      // ascending range without knowing the total first.
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (isMounted && data) {
        setMessages((data as Message[]).slice().reverse());
        setHasOlder(data.length === PAGE_SIZE);
      }
      if (isMounted) setLoading(false);

      // Mark this conversation as read now that it's open, and unhide it for this user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: readError } = await supabase
          .from("conversation_participants")
          .update({ last_read_at: new Date().toISOString(), hidden_at: null })
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id);

        // Logged, not toasted. This fires from opening a conversation rather
        // than from anything the user did, and the visible consequence is an
        // unread badge that does not clear — annoying, but not worth
        // interrupting a conversation to report. It was previously discarded
        // entirely, so a persistently stuck badge had no trace anywhere.
        if (readError) {
          console.error(
            "Could not mark conversation read:",
            JSON.stringify({ conversationId, error: readError.message })
          );
        }
      }

      // The thread may have been closed, or another opened, while the fetches
      // above were in flight. Its cleanup has already run; subscribing now
      // would leave a channel nothing closes — and, worse, remove the channel
      // of the thread that IS open (channelRef is shared), so switching
      // threads quickly stopped the visible one updating live.
      if (!isMounted) return;

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

  /**
   * The page before the one on screen.
   *
   * Ordered descending from the oldest message currently held, so it does not
   * depend on an offset that shifts when a new message arrives mid-scroll —
   * the one case plain offset paging gets wrong in a live thread.
   */
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasOlder || messages.length === 0) {
      return;
    }

    setLoadingOlder(true);

    const oldest = messages[0].created_at;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (!error && data) {
      const older = (data as Message[]).slice().reverse();

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
      setHasOlder(data.length === PAGE_SIZE);
    }

    setLoadingOlder(false);
  }, [conversationId, loadingOlder, hasOlder, messages]);

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
      toast.error(error.message);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: "", deleted_at: new Date().toISOString() } : m
      )
    );
    toast.success("Message deleted.");
  }

  return {
    messages,
    loading,
    loadingOlder,
    hasOlder,
    loadOlder,
    sending,
    sendMessage,
    deleteMessage,
  };
}