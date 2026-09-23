"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";
import { useToast } from "@/components/ui/Toast";

export type GeneralRequest = {
  id: string;
  submitted_by: string;
  subject: string;
  message: string;
  status: "pending" | "resolved" | "dismissed";
  admin_notes: string | null;
  created_at: string;
};

/** 20: an admin queue is worked through, so a deeper page than a browse list. */
const PAGE_SIZE = 20;

export function useGeneralRequests() {
  const toast = useToast();

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase
        .from("general_requests")
        .select("id, submitted_by, subject, message, status, admin_notes, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true }).order("id", { ascending: true });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as GeneralRequest[]) ?? null, error };
    },
    []
  );

  const {
    items: pending,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload: load,
  } = usePagedList<GeneralRequest>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (r) => r.id,
  });


  async function resolve(id: string, adminNotes?: string) {
    const { error } = await supabase
      .from("general_requests")
      .update({ status: "resolved", admin_notes: adminNotes || null })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Request resolved.");
    await load();
  }

  async function dismiss(id: string, adminNotes?: string) {
    const { error } = await supabase
      .from("general_requests")
      .update({ status: "dismissed", admin_notes: adminNotes || null })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Request dismissed.");
    await load();
  }

  return {
    pending,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    resolve,
    dismiss,
    reload: load,
  };
}