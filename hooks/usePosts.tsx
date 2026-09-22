"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { usePagedList } from "./usePagedList";

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
    signup_type: string | null;
  } | null;
};

const COLUMNS =
  "id, author_id, post_type, content, job_title, job_location, created_at, author:profiles(full_name, trade, company_logo_path, signup_type)";

/**
 * 10: about two screens of feed, and the ad rail places a card every fifth
 * item (FEED_AD_INTERVAL), so a page boundary never splits the pattern.
 */
const PAGE_SIZE = 10;

/**
 * The feed.
 *
 * IT DID NOT PAGE, despite infinite scroll having been built on 2026-09-15 —
 * that work reached the brand's ad submissions list and nothing else. This
 * selected every post ever written, with its author joined, and rendered all
 * of them.
 */
export function usePosts() {
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase
        .from("posts")
        .select(COLUMNS)
        .order("created_at", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as unknown as Post[]) ?? null, error };
    },
    []
  );

  const {
    items: posts,
    setItems: setPosts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload: load,
  } = usePagedList<Post>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (p) => p.id,
  });

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
      toast.error(error.message);
      return;
    }

    setPosts((prev) => prev.filter((p) => p.id !== id));
  }

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    userId,
    createPost,
    deletePost,
    reload: load,
  };
}