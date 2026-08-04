"use client";

import { useState } from "react";
import { usePostComments } from "@/hooks/usePostComments";

export function CommentSection({
  postId,
  currentUserId,
  onViewProfile,
}: {
  postId: string;
  currentUserId: string | null;
  onViewProfile: (userId: string) => void;
}) {
  const { comments, loading, addComment, deleteComment } = usePostComments(postId);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!newComment.trim()) return;

    setSubmitting(true);

    const { error } = await addComment(newComment);

    setSubmitting(false);

    if (error) {
      alert(error);
      return;
    }

    setNewComment("");
  }

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      {loading ? (
        <p className="text-gray-500 text-sm">Loading comments...</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map((comment) => {
            const isMe = comment.author_id === currentUserId;

            return (
              <div key={comment.id} className="flex justify-between items-start gap-3">
                <div>
                  <button
                    onClick={() => onViewProfile(comment.author_id)}
                    className="text-white font-semibold text-sm mr-2 hover:underline"
                  >
                    {comment.author?.full_name || "User"}
                  </button>
                  <span className="text-gray-300 text-sm">{comment.content}</span>
                </div>
                {isMe && (
                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="text-xs text-red-400 hover:text-red-300 shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
          {comments.length === 0 && (
            <p className="text-gray-500 text-sm">No comments yet.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Write a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="flex-1 p-2.5 rounded bg-zinc-800 border border-zinc-700 text-white text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-white text-black px-4 py-2 rounded font-semibold text-sm disabled:opacity-50"
        >
          {submitting ? "..." : "Post"}
        </button>
      </div>
    </div>
  );
}