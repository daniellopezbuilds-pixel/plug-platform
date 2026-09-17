"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useEligibleContacts } from "@/hooks/useEligibleContacts";
import { ConversationList } from "@/components/messaging/ConversationList";
import { MessageThread } from "@/components/messaging/MessageThread";
import { NewConversationPanel } from "@/components/messaging/NewConversationPanel";
import { useConversationParticipants } from "@/hooks/useConversationParticipants";
import { FULL_HEIGHT_PANEL_CLASS } from "@/lib/layout";
import { InlineLoader } from "@/components/ui/Loading";
import { Spinner } from "@/components/ui/Spinner";

export default function MessagesPage() {
  const {
    conversations,
    loading: convLoading,
    userId,
    startConversation,
    deleteConversation,
    refresh,
  } = useConversations();
  const { contacts } = useEligibleContacts();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);

  const [myRole, setMyRole] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const { messages, loading: msgLoading, sending, sendMessage, deleteMessage } = useMessages(activeId);
  const activeParticipantInfo = useConversationParticipants(activeId);

  useEffect(() => {
    async function loadMyProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, messaging_subscribed")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setMyRole(profile.role);
        setSubscribed(profile.messaging_subscribed || false);
      }
    }

    loadMyProfile();
  }, []);

  async function handleStart(participantIds: string[], title?: string) {
    const { error, conversationId } = await startConversation(participantIds, title);
    if (error) {
      alert(error);
      return;
    }
    setShowNewPanel(false);
    if (conversationId) setActiveId(conversationId);
  }

  async function handleSend(content: string) {
    const { error } = await sendMessage(content);
    if (error) {
      alert(error);
      return;
    }
    refresh();
  }

  function handleDeleteConversation(id: string) {
    if (activeId === id) setActiveId(null);
    deleteConversation(id);
  }

  const isLocked =
    myRole === "worker" &&
    !subscribed &&
    !!activeParticipantInfo &&
    !activeParticipantInfo.is_group &&
    activeParticipantInfo.participants.length === 1 &&
    activeParticipantInfo.participants[0].role === "employer";

  return (
    /* Capped and centred. The container went to 1600px, and a chat thread is
       the one surface that gets actively worse with width — the conversation
       list stays 320 and every extra pixel goes to the message pane, so at
       1920 the bubbles were stretching to about 1200px. */
    <div className={`relative mx-auto w-full max-w-[1280px] ${FULL_HEIGHT_PANEL_CLASS}`}>
      <div className="flex h-full border border-zinc-800 rounded-xl overflow-hidden">
        {/*
          Two panes side by side from lg. Under lg there is no room for both
          (the list alone was a fixed 320px on a 375px screen), so it becomes
          one pane at a time: the list until a conversation is picked, then the
          thread with a back button. activeId is the switch.
        */}
        <div
          className={`w-full lg:w-80 lg:flex border-r border-zinc-800 flex-col ${
            activeId ? "hidden" : "flex"
          }`}
        >
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white">Messages</h1>
            <button
              onClick={() => setShowNewPanel(true)}
              className="bg-accent text-on-accent px-4 min-h-11 lg:min-h-0 lg:py-1.5 rounded-lg text-sm font-semibold shrink-0"
            >
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-dark p-2">
            {convLoading ? (
              <InlineLoader message="Loading conversations" />
            ) : (
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={setActiveId}
                onDelete={handleDeleteConversation}
              />
            )}
          </div>
        </div>

        <div className={`flex-1 min-w-0 flex-col ${activeId ? "flex" : "hidden lg:flex"}`}>
          {/* Back to the list. Under lg the thread covers the whole panel, so
              without this there is no way out of a conversation. */}
          {activeId && (
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="lg:hidden flex items-center gap-2 min-h-11 px-4 border-b border-zinc-800 text-sm text-gray-300 hover:text-white transition"
            >
              <span aria-hidden="true">&larr;</span> All conversations
            </button>
          )}

          <div className="flex-1 min-h-0">
            {!activeId ? (
              <div className="h-full flex items-center justify-center text-gray-400 p-4 text-center">
                Select a conversation or start a new one.
              </div>
            ) : msgLoading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Spinner label="" />
                <p className="text-sm text-gray-400">Loading messages</p>
              </div>
            ) : (
              <MessageThread
                messages={messages}
                currentUserId={userId}
                sending={sending}
                onSend={handleSend}
                onDelete={deleteMessage}
                locked={isLocked}
              />
            )}
          </div>
        </div>
      </div>

      {showNewPanel && (
        <NewConversationPanel
          contacts={contacts}
          onStart={handleStart}
          onClose={() => setShowNewPanel(false)}
        />
      )}
    </div>
  );
}