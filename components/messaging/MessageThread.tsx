"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Message } from "@/hooks/useMessages";
import type { ParticipantInfo } from "@/hooks/useConversationParticipants";
import { SubscribeButton } from "@/components/messaging/SubscribeButton";
import { StatusBadge } from "@/components/applications/StatusBadge";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { VerifiedMark } from "@/components/ui/VerifiedMark";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { dayLabel, messageTime, sameDay } from "@/lib/chatTime";
import { signupTypeLabel } from "@/lib/signupRoles";

/** Consecutive messages from one sender closer than this read as one turn. */
const GROUP_GAP_MS = 5 * 60 * 1000;

/**
 * An open conversation: who it is with, what it is about, the messages, and
 * the composer.
 *
 * A HEADER THAT SAYS WHO YOU ARE TALKING TO. It used to open straight into
 * bubbles, with the other person's name only in the list beside it — and on a
 * phone, where the list is not on screen, nowhere at all. The header carries
 * their photo, name, verified shield, account type and trade, so all of that
 * is in view while you write.
 *
 * DAY DIVIDERS AND GROUPED BUBBLES. Messages from one person within five
 * minutes are one turn: tighter spacing, one timestamp under the last. A new
 * day gets a divider. A long thread used to be an undifferentiated column
 * with no time anywhere on it.
 *
 * DELETE BY TAP, NOT HOVER. The Delete link appeared on hover, so a phone
 * could not delete a message. Tapping your own message now shows its time and
 * a Delete button; hovering still works on a desktop.
 */
export function MessageThread({
  messages,
  currentUserId,
  sending,
  onSend,
  onDelete,
  locked = false,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
  info,
  title,
  onBack,
  onShowDetails,
}: {
  messages: Message[];
  currentUserId: string | null;
  sending: boolean;
  onSend: (content: string) => void;
  onDelete: (messageId: string) => void;
  locked?: boolean;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  /** Participants, job and application for the header and banner. */
  info: ParticipantInfo | null;
  /** Display name for the conversation, from the inbox row. */
  title: string;
  /** Back to the inbox — phones only, where the two do not fit side by side. */
  onBack?: () => void;
  /** Opens the details panel where it is not already on screen. */
  onShowDetails?: () => void;
}) {
  const [input, setInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();

  const other = info && !info.is_group ? info.participants[0] ?? null : null;
  const namesById = new Map(info?.participants.map((p) => [p.id, p.full_name]) ?? []);

  /**
   * Scroll to the newest message when the NEWEST MESSAGE CHANGES, not whenever
   * the array does — older pages are prepended, and keying on the array would
   * scroll the reader back down the instant they asked for earlier messages.
   */
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastId]);

  /**
   * Hold the reader's place when a page is prepended, by scrollHeight
   * difference — the new rows have no stable anchor until they exist.
   */
  const pendingAnchor = useRef<number | null>(null);
  const firstId = messages.length > 0 ? messages[0].id : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingAnchor.current === null) return;

    el.scrollTop = el.scrollHeight - pendingAnchor.current;
    pendingAnchor.current = null;
  }, [firstId]);

  // The composer grows with its content, up to about five lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  function handleLoadOlder() {
    const el = scrollRef.current;
    if (el) pendingAnchor.current = el.scrollHeight - el.scrollTop;
    onLoadOlder?.();
  }

  function handleSend() {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  }

  async function handleDelete(messageId: string) {
    const ok = await confirm({
      title: "Delete this message?",
      body: "It is replaced with “Message deleted” for everyone in the conversation. This cannot be undone.",
      confirmLabel: "Delete message",
    });
    if (!ok) return;
    onDelete(messageId);
    setSelectedId(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* HEADER */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-2 py-2 sm:px-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition hover:bg-zinc-900 hover:text-white lg:hidden"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
          </button>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          {info?.is_group ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-gray-400">
              <Icon name="userGroup" className="h-5 w-5" />
            </span>
          ) : (
            <Avatar name={title} photoPath={other?.company_logo_path} />
          )}
          <div className="min-w-0">
            <p className="flex items-center truncate font-semibold text-white">
              <span className="truncate">{title}</span>
              {other && <VerifiedMark profileId={other.id} />}
            </p>
            <p className="truncate text-xs text-gray-400">
              {info?.is_group
                ? `${info.participants.length + 1} people`
                : [signupTypeLabel(other?.signup_type), other?.trade, other?.location]
                    .filter(Boolean)
                    .join(" · ") || " "}
            </p>
          </div>
        </div>

        {onShowDetails && (
          <button
            type="button"
            onClick={onShowDetails}
            aria-label="Conversation details"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-zinc-900 hover:text-white"
          >
            <Icon name="info" className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* WHICH JOB THIS IS ABOUT — pinned above the scroller, not a first
          message: it survives a hundred replies, neither party can delete it,
          and it renders regardless of the messaging paywall, which refuses an
          unsubscribed worker's insert to an employer — exactly the
          electrician clicking Message on their own application. Not a link:
          there is no per-job route, and a banner that goes nowhere beats a
          link that lies. The application's status rides along so both sides
          can see where things stand without leaving the thread. */}
      {info?.job && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
          <Icon name="briefcase" className="h-4 w-4 shrink-0 text-accent-2-soft" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="text-gray-500">Re: </span>
            <span className="font-semibold text-white">{info.job.title}</span>
          </span>
          {info.application && <StatusBadge status={info.application.status} />}
        </div>
      )}

      {/* MESSAGES */}
      <div ref={scrollRef} className="scrollbar-dark min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {/* A button, not a scroll sentinel: auto-loading at the top of a chat
            fires the moment the reader scrolls up and then moves what they
            were reading. */}
        {hasOlder && (
          <div className="flex justify-center pb-3">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="min-h-11 rounded-full border border-zinc-800 px-4 text-xs font-semibold text-gray-400 transition hover:border-zinc-700 hover:text-white disabled:opacity-60"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && !hasOlder && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Avatar name={title} photoPath={other?.company_logo_path} size="lg" />
            <p className="mt-3 font-semibold text-white">{title}</p>
            <p className="mt-1 max-w-xs text-sm text-gray-400">
              No messages yet. Say hello — introduce yourself and what you are
              reaching out about.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const isMine = msg.sender_id === currentUserId;
          const isDeleted = Boolean(msg.deleted_at);

          const newDay = !prev || !sameDay(prev.created_at, msg.created_at);
          const startsTurn =
            newDay ||
            prev.sender_id !== msg.sender_id ||
            Date.parse(msg.created_at) - Date.parse(prev.created_at) > GROUP_GAP_MS;
          const endsTurn =
            !next ||
            next.sender_id !== msg.sender_id ||
            !sameDay(msg.created_at, next.created_at) ||
            Date.parse(next.created_at) - Date.parse(msg.created_at) > GROUP_GAP_MS;

          const selected = selectedId === msg.id;
          const canDelete = isMine && !isDeleted;

          return (
            <Fragment key={msg.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3" role="separator">
                  <span className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs font-semibold text-gray-500">
                    {dayLabel(msg.created_at)}
                  </span>
                  <span className="h-px flex-1 bg-zinc-800" />
                </div>
              )}

              {info?.is_group && !isMine && startsTurn && (
                <p className="mb-1 ml-1 mt-3 text-xs font-semibold text-gray-400">
                  {namesById.get(msg.sender_id) || "Member"}
                </p>
              )}

              <div
                className={`group flex flex-col ${isMine ? "items-end" : "items-start"} ${
                  startsTurn && !newDay ? "mt-3" : "mt-0.5"
                }`}
              >
                <div
                  {...(canDelete
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-expanded": selected,
                        onClick: () => setSelectedId(selected ? null : msg.id),
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(selected ? null : msg.id);
                          }
                        },
                      }
                    : {})}
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-[min(70%,560px)] ${
                    isDeleted
                      ? "border border-zinc-800 bg-transparent italic text-gray-500"
                      : isMine
                      ? "bg-accent-2 text-white"
                      : "bg-zinc-800 text-white"
                  } ${canDelete ? "cursor-pointer" : ""} ${
                    isMine ? (endsTurn ? "rounded-br-md" : "") : endsTurn ? "rounded-bl-md" : ""
                  }`}
                >
                  {isDeleted ? "Message deleted" : msg.content}
                </div>

                {(endsTurn || selected) && (
                  <div className={`mt-1 flex items-center gap-2 px-1 ${isMine ? "flex-row-reverse" : ""}`}>
                    <time dateTime={msg.created_at} className="text-[11px] text-gray-500">
                      {messageTime(msg.created_at)}
                    </time>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(msg.id)}
                        className={`-my-3 min-h-11 px-2 text-xs text-gray-500 transition hover:text-rose-400 ${
                          selected ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
                        }`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* COMPOSER */}
      {locked ? (
        <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-800 bg-zinc-900 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <p className="text-sm text-gray-400">
            Subscribe to message this employer directly.
          </p>
          <SubscribeButton />
        </div>
      ) : (
        <div className="flex shrink-0 items-end gap-2 border-t border-zinc-800 p-2 sm:p-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a new line — as in every chat app.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a message…"
            aria-label="Write a message"
            disabled={sending}
            className="scrollbar-dark min-h-11 flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-base leading-snug text-white placeholder:text-gray-500 [color-scheme:dark] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
          >
            <Icon name="send" className="h-5 w-5 rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}
