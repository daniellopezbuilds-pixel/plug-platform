"use client";

import { useState } from "react";
import { uploadAdImage } from "@/lib/ads";

export function AdForm({
  onCreate,
}: {
  onCreate: (input: {
    title: string;
    image_path: string;
    link_url: string;
    placement: "jobs_board" | "marketplace";
  }) => Promise<{ error: string | null }>;
}) {
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<"jobs_board" | "marketplace">("jobs_board");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!title || !file) {
      alert("Title and image are required.");
      return;
    }

    setSubmitting(true);

    const { error: uploadError, path } = await uploadAdImage(file);

    if (uploadError || !path) {
      alert(uploadError || "Image upload failed.");
      setSubmitting(false);
      return;
    }

    const { error } = await onCreate({
      title,
      image_path: path,
      link_url: linkUrl,
      placement,
    });

    setSubmitting(false);

    if (error) {
      alert(error);
      return;
    }

    setTitle("");
    setLinkUrl("");
    setFile(null);
    setPlacement("jobs_board");
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-6">
      <h3 className="text-white font-semibold mb-4">Create New Ad</h3>

      <input
        type="text"
        placeholder="Ad Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-3"
      />

      <input
        type="text"
        placeholder="Link URL (optional)"
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-3"
      />

      <div className="flex gap-3 mb-3">
        <button
          type="button"
          onClick={() => setPlacement("jobs_board")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            placement === "jobs_board"
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          Jobs Board
        </button>
        <button
          type="button"
          onClick={() => setPlacement("marketplace")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            placement === "marketplace"
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          Marketplace
        </button>
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-4"
      />

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="bg-white text-black px-5 py-2.5 rounded font-semibold disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Ad"}
      </button>
    </div>
  );
}