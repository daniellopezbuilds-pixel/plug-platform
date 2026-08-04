"use client";

import { useState } from "react";

export function CreatePostForm({
  onCreate,
}: {
  onCreate: (input: {
    post_type: "status" | "job";
    content: string;
    job_title?: string;
    job_location?: string;
  }) => Promise<{ error: string | null }>;
}) {
  const [postType, setPostType] = useState<"status" | "job">("status");
  const [content, setContent] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) {
      alert("Post content is required.");
      return;
    }

    if (postType === "job" && !jobTitle.trim()) {
      alert("Job title is required for a job post.");
      return;
    }

    setSubmitting(true);

    const { error } = await onCreate({
      post_type: postType,
      content,
      job_title: jobTitle,
      job_location: jobLocation,
    });

    setSubmitting(false);

    if (error) {
      alert(error);
      return;
    }

    setContent("");
    setJobTitle("");
    setJobLocation("");
    setPostType("status");
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
      <div className="flex gap-3 mb-3">
        <button
          type="button"
          onClick={() => setPostType("status")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            postType === "status"
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          Status
        </button>
        <button
          type="button"
          onClick={() => setPostType("job")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            postType === "job"
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          Job Opportunity
        </button>
      </div>

      {postType === "job" && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            placeholder="Job Title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
          <input
            type="text"
            placeholder="Location (optional)"
            value={jobLocation}
            onChange={(e) => setJobLocation(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
        </div>
      )}

      <textarea
        placeholder={
          postType === "job"
            ? "Describe the job opportunity..."
            : "Share an update with the community..."
        }
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white h-24 mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-white text-black px-5 py-2.5 rounded font-semibold disabled:opacity-50"
      >
        {submitting ? "Posting..." : "Post"}
      </button>
    </div>
  );
}