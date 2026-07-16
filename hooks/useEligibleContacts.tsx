"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EligibleContact = {
  id: string;
  full_name: string | null;
  profile_number: string | null;
  trade: string | null;
};

export function useEligibleContacts() {
  const [contacts, setContacts] = useState<EligibleContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // Accepted connections
    const { data: connections } = await supabase
      .from("connections")
      .select("requester_id, recipient_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

    const connectionIds = (connections || []).map((c) =>
      c.requester_id === user.id ? c.recipient_id : c.requester_id
    );

    // Applicants to my jobs
    const { data: myJobApplicants } = await supabase
      .from("applications")
      .select("worker_id, jobs!inner(user_id)")
      .eq("jobs.user_id", user.id);

    const applicantIds = (myJobApplicants || []).map((a: any) => a.worker_id);

    // Jobs I applied to -> their employers
    const { data: myApplications } = await supabase
      .from("applications")
      .select("jobs(user_id)")
      .eq("worker_id", user.id);

    const employerIds = (myApplications || [])
      .map((a: any) => a.jobs?.user_id)
      .filter(Boolean);

    const allIds = Array.from(
      new Set([...connectionIds, ...applicantIds, ...employerIds])
    ).filter((id) => id !== user.id);

    if (allIds.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, profile_number, trade")
      .in("id", allIds);

    if (profiles) setContacts(profiles as EligibleContact[]);
    setLoading(false);
  }

  return { contacts, loading, refresh: load };
}