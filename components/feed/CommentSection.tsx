"use client";

import { useState } from "react";
import { usePostComments } from "@/hooks/usePostComments";
import { InlineLoader } from "@/components/ui/Loading";
import { NameMeta } from "@/components/ui/NameMeta";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export function CommentSection({
  postId,
  currentUserId,
  onViewProfile,
}: {
  postId: string;
  currentUserId: string | null;
  onViewProfile: (userId: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete this comment?",
      body: "It is removed from the post for everyone. This cannot be undone.",
      confirmLabel: "Delete comment",
    });
    if (ok) deleteComment(id);
  }
  const { comments, loading, addComment, deleteComment } = usePostComments(postId);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!newComment.trim()) return;

    setSubmitting(true);

    const { error } = await addComment(newComment);

    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    setNewComment("");
  }

  return (
    <div className="pt-3">
      {loading ? (
        <InlineLoader message="Loading comments" />
      ) : (
        <div className="mb-3 space-y-2.5">
          {comments.map((comment) => {
            const isMe = comment.author_id === currentUserId;

            return (
              <div key={comment.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0 break-words pt-0.5">
                  <button
                    onClick={() => onViewProfile(comment.author_id)}
                    className="text-white font-semibold text-sm mr-2 hover:underline"
                  >
                    {comment.author?.full_name || "User"}
                  </button>
                  <NameMeta
                    profileId={comment.author_id}
                    signupType={comment.author?.signup_type}
                    inline
                  />
                  <span className="text-gray-300 text-sm">{comment.content}</span>
                </div>
                {isMe && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="-my-2 min-h-11 shrink-0 rounded-md px-2 text-xs text-gray-500 transition hover:text-rose-400"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
          {comments.length === 0 && (
            <p className="text-gray-400 text-sm">No comments yet.</p>
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
          aria-label="Write a comment"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base text-white placeholder:text-gray-500 [color-scheme:dark] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "..." : "Post"}
        </button>
      </div>
    </div>
  );
}