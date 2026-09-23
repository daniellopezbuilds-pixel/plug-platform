"use client";

import { useState } from "react";
import { ReactionBar } from "./ReactionBar";
import { CommentSection } from "./CommentSection";
import { NameMeta } from "@/components/ui/NameMeta";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { timeAgo } from "@/lib/relativeTime";
import type { Post } from "@/hooks/usePosts";
import type { PostReactionSummary, ReactionType } from "@/hooks/usePostReactions";

/**
 * One post.
 *
 * DENSER THAN IT WAS, ON PURPOSE. 20px of padding on every side and 20px
 * between cards meant three short posts filled a laptop screen. The padding
 * is 16px, the gap between cards 12px, and the author line is one row — photo,
 * name, trade, time — instead of a name stacked over a date.
 *
 * RELATIVE TIME, with the exact date on hover. "3h ago" is what a feed is
 * scanned for; the full date is there for anyone who needs it.
 *
 * The action row is a separate band under a rule, so the post's own text
 * ends cleanly and the controls read as controls. Every control in it is
 * 44px tall.
 */
export function PostCard({
  post,
  currentUserId,
  reactionSummary,
  onReact,
  onDelete,
  onViewProfile,
}: {
  post: Post;
  currentUserId: string | null;
  reactionSummary: PostReactionSummary;
  onReact: (reactionType: ReactionType) => void;
  onDelete: (id: string) => void;
  onViewProfile: (userId: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const confirm = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this post?",
      body: "It is removed from the feed for everyone, with its reactions and comments. This cannot be undone.",
      confirmLabel: "Delete post",
    });
    if (ok) onDelete(post.id);
  }

  const isMe = post.author_id === currentUserId;
  const name = post.author?.full_name || "User";
  const isJob = post.post_type === "job";

  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="px-4 pt-3.5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onViewProfile(post.author_id)}
            className="shrink-0 rounded-full"
            aria-label={`View ${name}'s profile`}
          >
            <Avatar name={name} photoPath={post.author?.company_logo_path} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="break-words leading-snug">
              <button
                type="button"
                onClick={() => onViewProfile(post.author_id)}
                className="font-semibold text-white hover:underline"
              >
                {name}
              </button>
              <NameMeta
                profileId={post.author_id}
                signupType={post.author?.signup_type}
                inline
              />
            </p>
            <p className="truncate text-xs text-gray-500">
              {post.author?.trade && <>{post.author.trade} · </>}
              <time
                dateTime={post.created_at}
                title={new Date(post.created_at).toLocaleString()}
              >
                {timeAgo(post.created_at)}
              </time>
            </p>
          </div>

          {isMe && (
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete post"
              title="Delete post"
              className="-mr-2 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-zinc-900 hover:text-rose-400"
            >
              <Icon name="trash" />
            </button>
          )}
        </div>

        {isJob && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
            <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
              <Icon name="briefcase" className="h-3.5 w-3.5" />
              Job opportunity
            </p>
            {post.job_title && (
              <p className="break-words font-semibold text-white">{post.job_title}</p>
            )}
            {post.job_location && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-gray-400">
                <Icon name="mapPin" className="h-3.5 w-3.5 shrink-0" />
                {post.job_location}
              </p>
            )}
          </div>
        )}

        <p className="mt-2.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-200">
          {post.content}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 px-2 py-1">
        <ReactionBar
          summary={reactionSummary}
          currentUserId={currentUserId}
          onReact={onReact}
          onViewProfile={onViewProfile}
        />
        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          aria-expanded={showComments}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition hover:bg-zinc-900 ${
            showComments ? "text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          <Icon name="chat" className="h-5 w-5" />
          {showComments ? "Hide comments" : "Comment"}
        </button>
      </div>

      {showComments && (
        <div className="border-t border-zinc-800/80 px-4 pb-3">
          <CommentSection
            postId={post.id}
            currentUserId={currentUserId}
            onViewProfile={onViewProfile}
          />
        </div>
      )}
    </article>
  );
}
