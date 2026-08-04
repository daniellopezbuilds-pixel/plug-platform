"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: {
    full_name: string | null;
  } | null;
};

export function usePostComments(postId: string) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("post_comments")
      .select("id, post_id, author_id, content, created_at, author:profiles(full_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      setComments([]);
      setLoading(false);
      return;
    }

    setComments(data as unknown as PostComment[]);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addComment(content: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in to comment." };

    if (!content.trim()) return { error: "Comment cannot be empty." };

    const { error } = await supabase.from("post_comments").insert({
      post_id: postId,
      author_id: user.id,
      content,
    });

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from("post_comments").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return { comments, loading, addComment, deleteComment, reload: load };
}