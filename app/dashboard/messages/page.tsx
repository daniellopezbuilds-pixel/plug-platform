"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useEligibleContacts } from "@/hooks/useEligibleContacts";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ConversationList, displayName } from "@/components/messaging/ConversationList";
import { MessageThread } from "@/components/messaging/MessageThread";
import { ConversationDetails } from "@/components/messaging/ConversationDetails";
import { NewConversationPanel } from "@/components/messaging/NewConversationPanel";
import { useConversationParticipants } from "@/hooks/useConversationParticipants";
import { FULL_HEIGHT_PANEL_CLASS } from "@/lib/layout";
import { InlineLoader } from "@/components/ui/Loading";
import { Spinner } from "@/components/ui/Spinner";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

/**
 * useSearchParams() forces the tree up to the nearest Suspense boundary to be
 * client-rendered, and a static route that calls it WITHOUT one fails the
 * production build — not dev, where routes render on demand and the problem
 * stays invisible. See
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<InlineLoader message="Loading messages" />}>
      <MessagesInbox />
    </Suspense>
  );
}

/**
 * Messages.
 *
 * THREE PANES, as in every messaging product people already use: the inbox,
 * the thread, and — from 1280px — the person and job the thread is about.
 * Under 1280 the details open as a sheet from the thread header's info
 * button; under lg the inbox and thread are one pane at a time, as before.
 *
 * FULL WIDTH, NO LONGER A CENTRED 1280px BOX. The thread column is the one
 * that grows, but its bubbles are capped at 560px, so the lines stay
 * readable however wide the window; the details panel is what uses the
 * width that remains.
 *
 * NOTHING BLANK. With no thread open the middle pane offers the people you
 * can message, one tap from a conversation, instead of "Select a
 * conversation".
 */
function MessagesInbox() {
  const toast = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  /**
   * ?conversation=<id> opens a thread directly, which is how the Message
   * button on an applicant or application card lands here. An opening
   * instruction applied once per value, not a URL kept in sync with the
   * selection — rewriting the URL on every click would fill the history.
   */
  const requestedConversation = searchParams.get("conversation");

  useEffect(() => {
    if (requestedConversation) setActiveId(requestedConversation);
  }, [requestedConversation]);

  const [myRole, setMyRole] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const {
    messages,
    loading: msgLoading,
    loadingOlder,
    hasOlder,
    loadOlder,
    sending,
    sendMessage,
    deleteMessage,
  } = useMessages(activeId);
  const activeInfo = useConversationParticipants(activeId);

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

  function openConversation(id: string | null) {
    setActiveId(id);
    setDetailsOpen(false);
  }

  async function handleStart(participantIds: string[], title?: string) {
    const { error, conversationId } = await startConversation(participantIds, title);
    if (error) {
      toast.error(error);
      return;
    }
    setShowNewPanel(false);
    if (conversationId) openConversation(conversationId);
  }

  async function handleSend(content: string) {
    const { error } = await sendMessage(content);
    if (error) {
      toast.error(error);
      return;
    }
    refresh();
  }

  async function handleDeleteConversation() {
    if (!activeId) return;
    const ok = await confirm({
      title: "Remove this conversation from your inbox?",
      body: "The other person keeps their copy. It comes back to your inbox if they send you a new message.",
      confirmLabel: "Remove conversation",
    });
    if (!ok) return;
    const id = activeId;
    openConversation(null);
    deleteConversation(id);
  }

  const isLocked =
    myRole === "worker" &&
    !subscribed &&
    !!activeInfo &&
    !activeInfo.is_group &&
    activeInfo.participants.length === 1 &&
    activeInfo.participants[0].role === "employer";

  // The inbox row has the name already; a thread opened from a link before
  // the inbox has loaded falls back to the participants the thread fetched.
  const activeSummary = conversations.find((c) => c.id === activeId);
  const activeTitle = activeSummary
    ? displayName(activeSummary)
    : activeInfo
    ? activeInfo.participants.map((p) => p.full_name || "Member").join(", ") || "Conversation"
    : "Conversation";

  const details = (
    <ConversationDetails
      info={activeInfo}
      title={activeTitle}
      viewerId={userId}
      onDeleteConversation={handleDeleteConversation}
    />
  );

  return (
    <div className={`relative w-full ${FULL_HEIGHT_PANEL_CLASS}`}>
      <div className="flex h-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {/* INBOX */}
        <div
          className={`w-full flex-col border-zinc-800 lg:flex lg:w-80 lg:shrink-0 lg:border-r ${
            activeId ? "hidden" : "flex"
          }`}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-3">
            <h1 className="pl-1 text-xl font-bold text-white">Messages</h1>
            <button
              type="button"
              onClick={() => setShowNewPanel(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover"
            >
              <Icon name="plus" className="h-4 w-4" />
              New
            </button>
          </div>

          {convLoading ? (
            <InlineLoader message="Loading conversations" />
          ) : conversations.length === 0 && !isDesktop ? (
            // Under lg the middle pane is not on screen, so an empty inbox
            // gets the start panel here instead of a one-line "no
            // conversations" with nothing to do next.
            <StartPanel
              contacts={contacts}
              hasConversations={false}
              onStart={(id) => handleStart([id])}
              onNew={() => setShowNewPanel(true)}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              currentUserId={userId}
              onSelect={openConversation}
            />
          )}
        </div>

        {/* THREAD */}
        <div className={`min-w-0 flex-1 flex-col ${activeId ? "flex" : "hidden lg:flex"}`}>
          {!activeId ? (
            <StartPanel
              contacts={contacts}
              hasConversations={conversations.length > 0}
              onStart={(id) => handleStart([id])}
              onNew={() => setShowNewPanel(true)}
            />
          ) : msgLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
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
              hasOlder={hasOlder}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlder}
              info={activeInfo}
              title={activeTitle}
              onBack={() => openConversation(null)}
              onShowDetails={wide ? undefined : () => setDetailsOpen(true)}
            />
          )}
        </div>

        {/* DETAILS — a third pane from 1280 */}
        {wide && activeId && (
          <aside
            aria-label="Conversation details"
            className="scrollbar-dark w-80 shrink-0 overflow-y-auto border-l border-zinc-800"
          >
            {details}
          </aside>
        )}
      </div>

      {/* DETAILS — a sheet below 1280 */}
      {!wide && detailsOpen && activeId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Conversation details"
            className="scrollbar-dark flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-2 py-2">
              <p className="pl-2 font-semibold text-white">Details</p>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close details"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-zinc-900 hover:text-white"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>
            {details}
          </div>
        </div>
      )}

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

/**
 * The middle pane with no thread open.
 *
 * The people you are allowed to message — connections, and the other side of
 * any application — each one tap from a conversation. That list already
 * existed behind the New button; surfacing the first few here turns an empty
 * panel into the obvious next step.
 */
function StartPanel({
  contacts,
  hasConversations,
  onStart,
  onNew,
}: {
  contacts: { id: string; full_name: string | null; trade: string | null }[];
  hasConversations: boolean;
  onStart: (id: string) => void;
  onNew: () => void;
}) {
  const shown = contacts.slice(0, 6);

  return (
    <div className="scrollbar-dark flex h-full flex-col items-center justify-center overflow-y-auto p-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 text-accent">
        <Icon name="chat" className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <p className="text-lg font-semibold text-white">
        {hasConversations ? "Pick a conversation" : "No messages yet"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-gray-400">
        {shown.length > 0
          ? "Or start one with someone you are connected to or have a job in common with."
          : "You can message your connections, and anyone on the other side of a job application. Connect with people in My Local Network to get started."}
      </p>

      {shown.length > 0 && (
        <ul className="mt-5 w-full max-w-sm divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-left">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onStart(c.id)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 transition hover:bg-zinc-900"
              >
                <Avatar name={c.full_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {c.full_name || "Member"}
                  </span>
                  {c.trade && (
                    <span className="block truncate text-xs text-gray-400">{c.trade}</span>
                  )}
                </span>
                <Icon name="chat" className="h-4 w-4 shrink-0 text-gray-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onNew}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-semibold text-white transition hover:border-zinc-500"
      >
        <Icon name="plus" className="h-4 w-4" />
        New message
      </button>
    </div>
  );
}
