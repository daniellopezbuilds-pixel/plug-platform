"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Job = {
  id: string;
  user_id: string;
  title: string;
  company: string | null;
  location: string | null;
  pay: string | null;
  description: string | null;
  created_at: string;
  required_union_status: string | null;
};

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: jobsData } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (jobsData) setJobs(jobsData as Job[]);

    if (user) {
      const { data: appsData } = await supabase
        .from("applications")
        .select("job_id")
        .eq("worker_id", user.id);

      if (appsData) {
        setAppliedJobIds(new Set(appsData.map((a) => a.job_id)));
      }
    }

    setLoading(false);
  }

  async function applyToJob(jobId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Please log in first." };

    setApplyingId(jobId);

    const { error } = await supabase
      .from("applications")
      .insert([{ job_id: jobId, worker_id: user.id }]);

    setApplyingId(null);

    if (error) {
      if (error.code === "23505") {
        setAppliedJobIds((prev) => new Set(prev).add(jobId));
        return { error: "You already applied to this job." };
      }
      return { error: error.message };
    }

    setAppliedJobIds((prev) => new Set(prev).add(jobId));
    return { error: null };
  }

  return { jobs, loading, appliedJobIds, applyingId, applyToJob, refresh: loadJobs };
}