"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type MyRequest = {
  id: string;
  type: "employer_verification" | "union_verification" | "ad_request" | "general_concern";
  title: string;
  status: "pending" | "approved" | "rejected" | "resolved" | "dismissed";
  created_at: string;
};

export function useMyRequests() {
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const results: MyRequest[] = [];

    // Employer verification (from profiles + employer_documents)
    const { data: profile } = await supabase
      .from("profiles")
      .select("employer_verified, union_status, union_verified")
      .eq("id", user.id)
      .maybeSingle();

    const { data: employerDoc } = await supabase
      .from("employer_documents")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (employerDoc) {
      results.push({
        id: employerDoc.id,
        type: "employer_verification",
        title: "Employer Verification",
        status: profile?.employer_verified ? "approved" : "pending",
        created_at: employerDoc.created_at,
      });
    }

    // Union verification (from profiles only — no dedicated submission row)
    if (profile?.union_status) {
      results.push({
        id: `union-${user.id}`,
        type: "union_verification",
        title: "Union Verification",
        status: profile.union_verified ? "approved" : "pending",
        created_at: "",
      });
    }

    // Ad requests
    const { data: adRequests } = await supabase
      .from("sponsored_listings")
      .select("id, title, status, created_at")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false });

    (adRequests || []).forEach((ad) => {
      results.push({
        id: ad.id,
        type: "ad_request",
        title: ad.title,
        status: ad.status as MyRequest["status"],
        created_at: ad.created_at,
      });
    });

    // General concerns
    const { data: generalRequests } = await supabase
      .from("general_requests")
      .select("id, subject, status, created_at")
      .eq("submitted_by", user.id)
      .order("created_at", { ascending: false });

    (generalRequests || []).forEach((req) => {
      results.push({
        id: req.id,
        type: "general_concern",
        title: req.subject,
        status: req.status as MyRequest["status"],
        created_at: req.created_at,
      });
    });

    // Sort everything by most recent first (union entries with no date sink to bottom)
    results.sort((a, b) => {
      if (!a.created_at) return 1;
      if (!b.created_at) return -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setRequests(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { requests, loading, reload: load };
}