"use client";

import { useState } from "react";
import { useSubmitAdRequest } from "@/hooks/useSubmitAdRequest";

export function SubmitAdRequest({ onSubmitted }: { onSubmitted?: () => void }) {
  const { submit, submitting } = useSubmitAdRequest();

  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [placement, setPlacement] = useState<"jobs_board" | "marketplace" | "feed">("jobs_board");
  const [file, setFile] = useState<File | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 30);

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().split("T")[0]);

  async function handleSubmit() {
    if (!title || !file) {
      alert("Title and image are required.");
      return;
    }

    if (!startDate || !endDate) {
      alert("Start and end dates are required.");
      return;
    }

    const { error } = await submit({
      title,
      link_url: linkUrl,
      placement,
      start_date: startDate,
      end_date: endDate,
      file,
    });

    if (error) {
      alert(error);
      return;
    }

    setTitle("");
    setLinkUrl("");
    setPlacement("jobs_board");
    setFile(null);
    setStartDate(today);
    setEndDate(defaultEnd.toISOString().split("T")[0]);

    alert("Ad request submitted. An admin will review it shortly.");
    onSubmitted?.();
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <h3 className="text-white font-semibold mb-4">Submit an Ad Request</h3>

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
        <button
          type="button"
          onClick={() => setPlacement("feed")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            placement === "feed"
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          Feed
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Desired Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Desired End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Dates are requests only — an admin will confirm the final run dates and any
        applicable charges upon approval.
      </p>

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
        {submitting ? "Submitting..." : "Submit Request"}
      </button>
    </div>
  );
}