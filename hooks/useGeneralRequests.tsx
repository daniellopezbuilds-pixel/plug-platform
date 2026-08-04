"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type GeneralRequest = {
  id: string;
  submitted_by: string;
  subject: string;
  message: string;
  status: "pending" | "resolved" | "dismissed";
  admin_notes: string | null;
  created_at: string;
};

export function useGeneralRequests() {
  const [pending, setPending] = useState<GeneralRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("general_requests")
      .select("id, submitted_by, subject, message, status, admin_notes, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error || !data) {
      setPending([]);
      setLoading(false);
      return;
    }

    setPending(data as GeneralRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string, adminNotes?: string) {
    const { error } = await supabase
      .from("general_requests")
      .update({ status: "resolved", admin_notes: adminNotes || null })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  }

  async function dismiss(id: string, adminNotes?: string) {
    const { error } = await supabase
      .from("general_requests")
      .update({ status: "dismissed", admin_notes: adminNotes || null })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  }

  return { pending, loading, resolve, dismiss, reload: load };
}