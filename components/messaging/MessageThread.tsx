"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/hooks/useMessages";

export function MessageThread({
  messages,
  currentUserId,
  sending,
  onSend,
}: {
  messages: Message[];
  currentUserId: string | null;
  sending: boolean;
  onSend: (content: string) => void;
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                  isMine ? "bg-yellow-400 text-black" : "bg-zinc-800 text-white"
                }`}
              >
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

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
    </div>
  );
}