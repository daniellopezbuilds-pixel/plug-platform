"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setJobs(data);
    }

    setLoading(false);
  }

  async function applyToJob(jobId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("Please login first.");
      return;
    }

    const { error } = await supabase
      .from("applications")
      .insert([
        {
          job_id: jobId,
          worker_id: user.id,
        },
      ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Application submitted!");
    }
  }

  if (loading) {
    return (
      <div className="text-white">
        Loading jobs...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-5xl font-bold text-white mb-8">
        Jobs Board
      </h1>

      <div className="space-y-6">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="border border-zinc-800 rounded-xl p-6"
          >
            <h2 className="text-2xl font-bold text-white">
              {job.title}
            </h2>

            <p className="text-zinc-400 mt-2">
              {job.location}
            </p>

            <p className="text-green-400 font-semibold mt-2">
              {job.pay}
            </p>

            <p className="text-zinc-300 mt-4 mb-6">
              {job.description}
            </p>

            <button
              onClick={() => applyToJob(job.id)}
              className="bg-white text-black px-5 py-3 rounded-lg font-semibold"
            >
              Apply Now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}