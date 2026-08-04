"use client";

import { useState } from "react";
import { ReactionBar } from "./ReactionBar";
import { CommentSection } from "./CommentSection";
import type { Post } from "@/hooks/usePosts";
import type { PostReactionSummary, ReactionType } from "@/hooks/usePostReactions";

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

  const isMe = post.author_id === currentUserId;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <button
            onClick={() => onViewProfile(post.author_id)}
            className="text-white font-semibold hover:underline"
          >
            {post.author?.full_name || "User"}
          </button>
          {post.author?.trade && (
            <span className="text-gray-500 font-normal text-sm"> · {post.author.trade}</span>
          )}
          <p className="text-xs text-gray-500">
            {new Date(post.created_at).toLocaleDateString()}
          </p>
        </div>

        {post.post_type === "job" && (
          <span className="bg-yellow-950 text-yellow-400 border border-yellow-800 px-3 py-1 rounded-full text-xs font-semibold">
            Job Opportunity
          </span>
        )}

        {isMe && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-red-400 hover:text-red-300 ml-2"
          >
            Delete
          </button>
        )}
      </div>

      {post.post_type === "job" && post.job_title && (
        <div className="mb-2">
          <p className="text-white font-semibold">{post.job_title}</p>
          {post.job_location && (
            <p className="text-gray-400 text-sm">{post.job_location}</p>
          )}
        </div>
      )}

      <p className="text-gray-300 whitespace-pre-wrap mb-4">{post.content}</p>

      <div className="flex items-center justify-between">
        <ReactionBar
          summary={reactionSummary}
          currentUserId={currentUserId}
          onReact={onReact}
          onViewProfile={onViewProfile}
        />
        <button
          onClick={() => setShowComments(!showComments)}
          className="text-gray-400 hover:text-white text-sm font-semibold"
        >
          {showComments ? "Hide Comments" : "Comments"}
        </button>
      </div>

      {showComments && (
        <CommentSection
          postId={post.id}
          currentUserId={currentUserId}
          onViewProfile={onViewProfile}
        />
      )}
    </div>
  );
}