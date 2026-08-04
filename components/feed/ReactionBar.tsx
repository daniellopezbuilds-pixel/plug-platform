"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactionType, PostReactionSummary } from "@/hooks/usePostReactions";

const reactionConfig: Record<ReactionType, { label: string; emoji: string }> = {
  like: { label: "Like", emoji: "👍" },
  celebrate: { label: "Celebrate", emoji: "🎉" },
  support: { label: "Support", emoji: "🤝" },
  insightful: { label: "Insightful", emoji: "💡" },
};

export function ReactionBar({
  summary,
  currentUserId,
  onReact,
  onViewProfile,
}: {
  summary: PostReactionSummary;
  currentUserId: string | null;
  onReact: (reactionType: ReactionType) => void;
  onViewProfile: (userId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    }

    if (pickerOpen || listOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen, listOpen]);

  const activeReactions = (Object.keys(reactionConfig) as ReactionType[]).filter(
    (type) => summary.counts[type] > 0
  );

  return (
    <div className="relative flex items-center gap-3">
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => {
            if (summary.userReaction) {
              onReact(summary.userReaction);
            } else {
              setPickerOpen(!pickerOpen);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setPickerOpen(!pickerOpen);
          }}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            summary.userReaction
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400 hover:text-white"
          }`}
        >
          {summary.userReaction
            ? `${reactionConfig[summary.userReaction].emoji} ${reactionConfig[summary.userReaction].label}`
            : "👍 Like"}
        </button>

        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-700 rounded-full text-[10px] flex items-center justify-center text-gray-300 hover:bg-zinc-600"
          title="More reactions"
        >
          ▾
        </button>

        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-lg p-2 flex gap-1 z-10 shadow-lg">
            {(Object.keys(reactionConfig) as ReactionType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  onReact(type);
                  setPickerOpen(false);
                }}
                title={reactionConfig[type].label}
                className="text-2xl hover:scale-125 transition-transform p-1.5 rounded hover:bg-zinc-700"
              >
                {reactionConfig[type].emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {summary.total > 0 && (
        <div className="relative" ref={listRef}>
          <button
            onClick={() => setListOpen(!listOpen)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition"
          >
            {activeReactions.map((type) => (
              <span key={type}>{reactionConfig[type].emoji}</span>
            ))}
            <span>{summary.total}</span>
          </button>

          {listOpen && (
            <div className="absolute bottom-full left-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-lg p-2 min-w-[180px] max-h-48 overflow-y-auto z-10 shadow-lg space-y-1">
              {summary.reactors.map((reactor, i) => {
                const isMe = reactor.id === currentUserId;
                const name = isMe ? "You" : reactor.full_name || "User";

                return (
                  <button
                    key={`${reactor.id}-${i}`}
                    onClick={() => {
                      if (!isMe) {
                        onViewProfile(reactor.id);
                        setListOpen(false);
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-200 text-left ${
                      isMe ? "cursor-default" : "hover:bg-zinc-700"
                    }`}
                  >
                    <span>{reactionConfig[reactor.reaction_type].emoji}</span>
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}