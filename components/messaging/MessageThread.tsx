"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/hooks/useMessages";
import { SubscribeButton } from "@/components/messaging/SubscribeButton";

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
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Scroll to the newest message when the NEWEST MESSAGE CHANGES, not whenever
   * the array does.
   *
   * This used to key on `messages`, which was fine while the only way the list
   * changed was a message arriving at the end. Now that older pages are
   * prepended, that would scroll the reader back to the bottom the instant
   * they asked to see earlier messages — undoing the thing they just clicked.
   */
  const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastId]);

  /**
   * Hold the reader's place when a page is prepended.
   *
   * Inserting content above the viewport pushes everything down by its height,
   * so without this the thread jumps by exactly one page. Measured before the
   * paint that adds the rows and corrected after it, using scrollHeight
   * difference rather than a saved element offset — the rows have no stable
   * anchor until they exist.
   */
  const pendingAnchor = useRef<number | null>(null);
  const firstId = messages.length > 0 ? messages[0].id : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingAnchor.current === null) return;

    el.scrollTop = el.scrollHeight - pendingAnchor.current;
    pendingAnchor.current = null;
  }, [firstId]);

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

  function handleDelete(messageId: string) {
    if (confirm("Delete this message? This cannot be undone.")) {
      onDelete(messageId);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-dark space-y-3 p-4"
      >
        {/* A button, not a scroll sentinel. Auto-loading at the top of a chat
            fights the reader: it fires the moment they scroll up, then the
            content it adds moves what they were looking at. Asking is both
            calmer and keyboard-reachable. */}
        {hasOlder && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="text-xs font-semibold text-gray-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-full px-4 py-2 transition disabled:opacity-60"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          const isDeleted = Boolean(msg.deleted_at);

          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} group`}>
              {isMine && !isDeleted && (
                <button
                  onClick={() => handleDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-xs text-gray-400 hover:text-rose-400 self-center mr-2"
                >
                  Delete
                </button>
              )}
              <div
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                  isDeleted
                    ? "bg-zinc-900 border border-zinc-800 text-gray-400 italic"
                    : isMine
                    ? "bg-accent-2 text-white"
                    : "bg-zinc-800 text-white"
                }`}
              >
                <p className="text-sm">{isDeleted ? "Message deleted" : msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {locked ? (
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900">
          <p className="text-gray-400 text-sm">
            Subscribe to message this employer directly.
          </p>
          <SubscribeButton />
        </div>
      ) : (
        <div className="flex gap-2 p-4 border-t border-zinc-800">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="bg-accent text-on-accent px-5 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}