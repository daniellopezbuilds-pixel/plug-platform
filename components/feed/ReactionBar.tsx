"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactionType, PostReactionSummary } from "@/hooks/usePostReactions";
import { Icon } from "@/components/ui/Icon";

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
    <div className="relative flex items-center gap-1">
      {/* Like and the picker toggle are one segmented control: two 44px
          targets side by side. The toggle used to be a 16px circle
          overlapping the corner of the Like button — too small to hit on a
          phone, and it sat on top of the thing it was not. */}
      <div className="relative flex items-center" ref={containerRef}>
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
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-l-lg pl-3 pr-2 text-sm font-semibold transition hover:bg-zinc-900 ${
            summary.userReaction ? "text-accent" : "text-gray-400 hover:text-white"
          }`}
        >
          {summary.userReaction
            ? `${reactionConfig[summary.userReaction].emoji} ${reactionConfig[summary.userReaction].label}`
            : "👍 Like"}
        </button>

        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          aria-label="More reactions"
          aria-expanded={pickerOpen}
          title="More reactions"
          className="flex min-h-11 w-8 items-center justify-center rounded-r-lg text-gray-500 transition hover:bg-zinc-900 hover:text-white"
        >
          <Icon name="chevronDown" className="h-4 w-4" />
        </button>

        {pickerOpen && (
          <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1 flex gap-1 z-10">
            {(Object.keys(reactionConfig) as ReactionType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  onReact(type);
                  setPickerOpen(false);
                }}
                title={reactionConfig[type].label}
                aria-label={reactionConfig[type].label}
                className="flex h-11 w-11 items-center justify-center rounded-md text-2xl transition-transform hover:scale-110 hover:bg-zinc-800"
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
            aria-label={`${summary.total} reactions — see who reacted`}
            className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-400 transition hover:bg-zinc-900 hover:text-white"
          >
            {activeReactions.map((type) => (
              <span key={type}>{reactionConfig[type].emoji}</span>
            ))}
            <span>{summary.total}</span>
          </button>

          {listOpen && (
            <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1 min-w-[180px] max-h-48 overflow-y-auto scrollbar-dark z-10 space-y-0.5">
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
                    className={`w-full min-h-11 flex items-center gap-2 px-2 rounded text-sm text-gray-200 text-left ${
                      isMe ? "cursor-default" : "hover:bg-zinc-800"
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