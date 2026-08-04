"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Post = {
  id: string;
  author_id: string;
  post_type: "status" | "job";
  content: string;
  job_title: string | null;
  job_location: string | null;
  created_at: string;
  author: {
    full_name: string | null;
    trade: string | null;
    company_logo_path: string | null;
  } | null;
};

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUserId(user?.id || null);

    const { data, error } = await supabase
      .from("posts")
      .select(
        "id, author_id, post_type, content, job_title, job_location, created_at, author:profiles(full_name, trade, company_logo_path)"
      )
      .order("created_at", { ascending: false });

    if (error || !data) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setPosts(data as unknown as Post[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPost(input: {
    post_type: "status" | "job";
    content: string;
    job_title?: string;
    job_location?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "You must be logged in to post." };

    const { error } = await supabase.from("posts").insert({
      author_id: user.id,
      post_type: input.post_type,
      content: input.content,
      job_title: input.post_type === "job" ? input.job_title || null : null,
      job_location: input.post_type === "job" ? input.job_location || null : null,
    });

    if (error) return { error: error.message };

    await load();
    return { error: null };
  }

  async function deletePost(id: string) {
    const { error } = await supabase.from("posts").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return { posts, loading, userId, createPost, deletePost, reload: load };
}