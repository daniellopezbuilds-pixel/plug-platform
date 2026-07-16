"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PendingEmployer = {
  id: string;
  full_name: string | null;
  company_description: string | null;
  company_logo_path: string | null;
  document_id: string;
  document_label: string;
  document_path: string;
};

export function useEmployerVerifications() {
  const [pending, setPending] = useState<PendingEmployer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("employer_documents")
      .select(
        "id, label, file_path, user_id, profiles!inner(id, full_name, company_description, company_logo_path, employer_verified)"
      )
      .eq("profiles.employer_verified", false)
      .order("created_at", { ascending: false });

    if (error || !data) {
      setPending([]);
      setLoading(false);
      return;
    }

    const mapped: PendingEmployer[] = data.map((row: any) => ({
      id: row.profiles.id,
      full_name: row.profiles.full_name,
      company_description: row.profiles.company_description,
      company_logo_path: row.profiles.company_logo_path,
      document_id: row.id,
      document_label: row.label,
      document_path: row.file_path,
    }));

    setPending(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(profileId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ employer_verified: true })
      .eq("id", profileId);

    if (error) {
      alert(error.message);
      return;
    }

    setPending((prev) => prev.filter((p) => p.id !== profileId));
  }

  function reject(profileId: string) {
    setPending((prev) => prev.filter((p) => p.id !== profileId));
  }

  return { pending, loading, approve, reject, reload: load };
}