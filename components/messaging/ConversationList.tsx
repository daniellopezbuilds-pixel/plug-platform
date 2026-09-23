"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/hooks/useConversations";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import { inboxTime } from "@/lib/chatTime";

/**
 * The inbox.
 *
 * EACH ROW ANSWERS "WHO, WHAT, WHEN, AND DO I OWE THEM A REPLY" without
 * opening it: photo, name, the job it is about when there is one, the last
 * line (prefixed "You:" when it was yours, so you can tell at a glance whose
 * turn it is), a timestamp, and an unread dot. It used to be a name and a
 * preview, with no time and no way to tell a job thread from a chat.
 *
 * SEARCH AND AN UNREAD FILTER, both client-side over the loaded list. The
 * inbox is every conversation you are in — dozens, not thousands — so a
 * query per keystroke would cost more than it saves.
 *
 * DELETE MOVED OUT OF THE ROW. It was an ✕ that appeared on hover, which a
 * phone cannot do, so on mobile a conversation could not be deleted at all.
 * It now lives in the thread's details panel, reachable everywhere.
 */
export function ConversationList({
  conversations,
  activeId,
  currentUserId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const unreadCount = conversations.filter((c) => c.isUnread).length;
  const q = query.trim().toLowerCase();

  const shown = conversations.filter((conv) => {
    if (unreadOnly && !conv.isUnread) return false;
    if (!q) return true;
    return (
      displayName(conv).toLowerCase().includes(q) ||
      (conv.job?.title.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-zinc-800 px-3 pb-3">
        <label className="relative block">
          <span className="sr-only">Search conversations</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or job"
            className="min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-base text-white placeholder:text-gray-500 [color-scheme:dark] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        <div role="radiogroup" aria-label="Show" className="flex gap-1">
          {[
            { value: false, label: "All" },
            { value: true, label: `Unread${unreadCount ? ` (${unreadCount})` : ""}` },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={unreadOnly === opt.value}
              onClick={() => setUnreadOnly(opt.value)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${
                unreadOnly === opt.value
                  ? "bg-zinc-700 text-white"
                  : "text-gray-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-dark min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            {conversations.length === 0
              ? "No conversations yet."
              : unreadOnly && !q
              ? "You're all caught up."
              : "No conversations match."}
          </p>
        ) : (
          <ul>
            {shown.map((conv) => (
              <li key={conv.id}>
                <ConversationRow
                  conv={conv}
                  active={activeId === conv.id}
                  mine={conv.lastMessage?.sender_id === currentUserId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function displayName(conv: ConversationSummary): string {
  if (conv.is_group) {
    return conv.title || conv.participants.map((p) => p.full_name || "Unknown").join(", ");
  }
  return conv.participants[0]?.full_name || "Unknown";
}

function ConversationRow({
  conv,
  active,
  mine,
  onSelect,
}: {
  conv: ConversationSummary;
  active: boolean;
  mine: boolean;
  onSelect: (id: string) => void;
}) {
  const name = displayName(conv);
  const other = conv.participants[0];
  const last = conv.lastMessage;
  const preview = !last ? "" : last.deleted_at ? "Message deleted" : last.content;

  return (
    <button
      type="button"
      onClick={() => onSelect(conv.id)}
      aria-current={active ? "true" : undefined}
      className={`relative flex w-full items-start gap-3 px-3 py-3 text-left transition ${
        active ? "bg-zinc-800/80" : "hover:bg-zinc-900"
      }`}
    >
      {/* The active row carries the same orange edge as the active nav item. */}
      {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}

      {conv.is_group ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-gray-400">
          <Icon name="userGroup" className="h-5 w-5" />
        </span>
      ) : (
        <Avatar name={name} photoPath={other?.company_logo_path} />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center">
            <span
              className={`truncate text-sm ${
                conv.isUnread ? "font-bold text-white" : "font-semibold text-gray-200"
              }`}
            >
              {name}
            </span>
            {!conv.is_group && <VerifiedMark profileId={other?.id} />}
          </span>
          {last && (
            <span
              className={`shrink-0 text-xs ${conv.isUnread ? "font-semibold text-accent" : "text-gray-500"}`}
            >
              {inboxTime(last.created_at)}
            </span>
          )}
        </span>

        {conv.job && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-accent-2-soft">
            <Icon name="briefcase" className="h-3 w-3 shrink-0" />
            <span className="truncate">{conv.job.title}</span>
          </span>
        )}

        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              conv.isUnread ? "font-medium text-white" : "text-gray-400"
            } ${last?.deleted_at ? "italic" : ""}`}
          >
            {mine && !last?.deleted_at && <span className="text-gray-500">You: </span>}
            {preview}
          </span>
          {conv.isUnread && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent">
              <span className="sr-only">Unread</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
