"use client";

import { useState } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useEligibleContacts } from "@/hooks/useEligibleContacts";
import { ConversationList } from "@/components/messaging/ConversationList";
import { MessageThread } from "@/components/messaging/MessageThread";
import { NewConversationPanel } from "@/components/messaging/NewConversationPanel";

export default function MessagesPage() {
  const { conversations, loading: convLoading, userId, startConversation } = useConversations();
  const { contacts } = useEligibleContacts();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);

  const { messages, loading: msgLoading, sending, sendMessage } = useMessages(activeId);

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
    if (error) alert(error);
  }

  return (
    <div className="relative h-[calc(100vh-8rem)]">
      <div className="flex h-full border border-zinc-800 rounded-xl overflow-hidden">
        <div className="w-80 border-r border-zinc-800 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Messages</h1>
            <button
              onClick={() => setShowNewPanel(true)}
              className="bg-white text-black px-3 py-1.5 rounded-lg text-sm font-semibold"
            >
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {convLoading ? (
              <p className="text-gray-400 text-sm p-4">Loading...</p>
            ) : (
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={setActiveId}
              />
            )}
          </div>
        </div>

        <div className="flex-1">
          {!activeId ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              Select a conversation or start a new one.
            </div>
          ) : msgLoading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              Loading messages...
            </div>
          ) : (
            <MessageThread
              messages={messages}
              currentUserId={userId}
              sending={sending}
              onSend={handleSend}
            />
          )}
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