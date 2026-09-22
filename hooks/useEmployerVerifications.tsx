"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePagedList } from "./usePagedList";
import { useToast } from "@/components/ui/Toast";

export type PendingEmployer = {
  id: string;
  full_name: string | null;
  company_description: string | null;
  company_logo_path: string | null;
  signup_type: string | null;
  document_id: string;
  /**
   * Nullable, because employer_documents.label is. It was typed `string` here
   * and the mapping went through an `any`, so the mismatch never surfaced —
   * a document uploaded without a label rendered "View Document (null)".
   */
  document_label: string | null;
  document_path: string;
};

/** 20: an admin queue is worked through, so a deeper page than a browse list. */
const PAGE_SIZE = 20;

type EmployerDocRow = {
  id: string;
  label: string | null;
  file_path: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    company_description: string | null;
    company_logo_path: string | null;
    employer_verified: boolean | null;
    signup_type: string | null;
  };
};

export function useEmployerVerifications() {
  const toast = useToast();

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase
        .from("employer_documents")
        .select(
          "id, label, file_path, user_id, profiles!inner(id, full_name, company_description, company_logo_path, employer_verified, signup_type)"
        )
        .eq("profiles.employer_verified", false)
        .order("created_at", { ascending: false });

      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error || !data) return { data: null, error };

      // Flattened here rather than in the component: the card wants a profile
      // with a document attached, and the query has to be rooted at the
      // document to filter on the join.
      const mapped: PendingEmployer[] = (data as unknown as EmployerDocRow[]).map(
        (row) => ({
          id: row.profiles.id,
          full_name: row.profiles.full_name,
          company_description: row.profiles.company_description,
          company_logo_path: row.profiles.company_logo_path,
          signup_type: row.profiles.signup_type,
          document_id: row.id,
          document_label: row.label,
          document_path: row.file_path,
        })
      );

      return { data: mapped, error: null };
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
  } = usePagedList<PendingEmployer>({
    pageSize: PAGE_SIZE,
    fetchPage,
    // The PROFILE is the identity here, not the document row the query is
    // rooted at -- one employer with two uploaded documents is one queue entry.
    getId: (p) => p.id,
  });

  async function approve(profileId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ employer_verified: true })
      .eq("id", profileId);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPending((prev) => prev.filter((p) => p.id !== profileId));
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