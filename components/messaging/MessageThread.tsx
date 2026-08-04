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
}: {
  messages: Message[];
  currentUserId: string | null;
  sending: boolean;
  onSend: (content: string) => void;
  onDelete: (messageId: string) => void;
  locked?: boolean;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          const isDeleted = Boolean(msg.deleted_at);

          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"} group`}>
              {isMine && !isDeleted && (
                <button
                  onClick={() => handleDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-xs text-gray-500 hover:text-red-400 self-center mr-2"
                >
                  Delete
                </button>
              )}
              <div
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                  isDeleted
                    ? "bg-zinc-900 border border-zinc-800 text-gray-500 italic"
                    : isMine
                    ? "bg-yellow-400 text-black"
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
            className="bg-white text-black px-5 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}