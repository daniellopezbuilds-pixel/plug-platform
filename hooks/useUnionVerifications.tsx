"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

export type PendingUnionWorker = {
  id: string;
  full_name: string | null;
  trade: string | null;
  union_status: string;
  signup_type: string | null;
};

export function useUnionVerifications() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingUnionWorker[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, trade, union_status, signup_type")
      .eq("union_verified", false)
      .not("union_status", "is", null);

    if (error || !data) {
      setPending([]);
      setLoading(false);
      return;
    }

    setPending(data as PendingUnionWorker[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
  }

  function reject(profileId: string) {
    setPending((prev) => prev.filter((p) => p.id !== profileId));
  }

  return { pending, loading, approve, reject, reload: load };
}