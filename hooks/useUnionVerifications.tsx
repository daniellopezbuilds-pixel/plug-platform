"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";
import { useToast } from "@/components/ui/Toast";

export type PendingUnionWorker = {
  id: string;
  full_name: string | null;
  trade: string | null;
  union_status: string;
  signup_type: string | null;
};

/** 20: an admin queue is worked through, so a deeper page than a browse list. */
const PAGE_SIZE = 20;

export function useUnionVerifications() {
  const toast = useToast();

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase
        .from("profiles")
        .select("id, full_name, trade, union_status, signup_type")
        .eq("union_verified", false)
        .not("union_status", "is", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as PendingUnionWorker[]) ?? null, error };
    },
    []
  );

  const {
    items: pending,
    setItems: setPending,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload: load,
  } = usePagedList<PendingUnionWorker>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (p) => p.id,
  });

  async function approve(profileId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ union_verified: true })
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPending((prev) => prev.filter((p) => p.id !== profileId));
    toast.success("Union status verified.");
  }

  function reject(profileId: string) {
    setPending((prev) => prev.filter((p) => p.id !== profileId));
  }

  return {
    pending,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    approve,
    reject,
    reload: load,
  };
}