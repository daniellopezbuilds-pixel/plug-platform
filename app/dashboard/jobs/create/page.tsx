"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";

export default function CreateJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [pay, setPay] = useState("");
  const [description, setDescription] = useState("");
  const [requiredUnionStatus, setRequiredUnionStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Job title is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("jobs").insert([
      {
        user_id: user.id,
        title,
        company,
        location,
        pay,
        description,
        required_union_status: requiredUnionStatus,
      },
    ]);

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/jobs");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-5xl font-bold text-white mb-8">Post a Job</h1>

      <Card>
        <div className="space-y-4">
          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <input
            type="text"
            placeholder="Job Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50"
          />

          <input
            type="text"
            placeholder="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={submitting}
            className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50"
          />

          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={submitting}
            className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50"
          />

          <input
            type="text"
            placeholder="Pay"
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            disabled={submitting}
            className="w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50"
          />

          <textarea
            placeholder="Job Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
            className="w-full h-40 p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50"
          />

          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Required Union Status (optional)
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setRequiredUnionStatus(requiredUnionStatus === "union" ? null : "union")
                }
                disabled={submitting}
                className={`px-5 py-3 rounded-lg font-semibold border transition disabled:opacity-50 ${
                  requiredUnionStatus === "union"
                    ? "bg-blue-950 border-blue-700 text-blue-400"
                    : "bg-zinc-800 border-zinc-700 text-gray-400"
                }`}
              >
                Union Required
              </button>
              <button
                type="button"
                onClick={() =>
                  setRequiredUnionStatus(requiredUnionStatus === "non_union" ? null : "non_union")
                }
                disabled={submitting}
                className={`px-5 py-3 rounded-lg font-semibold border transition disabled:opacity-50 ${
                  requiredUnionStatus === "non_union"
                    ? "bg-zinc-700 border-zinc-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-gray-400"
                }`}
              >
                Non-Union Required
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Click a selected option again to remove the requirement.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-white text-black px-6 py-4 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Posting..." : "Post Job"}
          </button>
        </div>
      </Card>
    </div>
  );
}