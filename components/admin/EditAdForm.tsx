"use client";

import { useState } from "react";
import { uploadAdImage } from "@/lib/ads";
import type { Ad } from "@/hooks/useAds";

export function EditAdForm({
  ad,
  onSave,
  onCancel,
}: {
  ad: Ad;
  onSave: (updates: {
    title: string;
    link_url: string;
    placement: "jobs_board" | "marketplace" | "feed";
    image_path?: string;
    start_date?: string | null;
    end_date?: string | null;
    is_paid_ad?: boolean;
    payment_status?: string;
    amount_charged?: number | null;
  }) => Promise<{ error: string | null }>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(ad.title);
  const [linkUrl, setLinkUrl] = useState(ad.link_url || "");
  const [placement, setPlacement] = useState<"jobs_board" | "marketplace" | "feed">(ad.placement);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [startDate, setStartDate] = useState(ad.start_date || "");
  const [endDate, setEndDate] = useState(ad.end_date || "");
  const [isPaidAd, setIsPaidAd] = useState(ad.is_paid_ad || false);
  const [paymentStatus, setPaymentStatus] = useState(ad.payment_status || "unpaid");
  const [amountCharged, setAmountCharged] = useState(
    ad.amount_charged?.toString() || ""
  );

  async function handleSubmit() {
    if (!title.trim()) {
      alert("Title is required.");
      return;
    }

    setSubmitting(true);

    let image_path: string | undefined = undefined;

    if (file) {
      const { error: uploadError, path } = await uploadAdImage(file);

      if (uploadError || !path) {
        alert(uploadError || "Image upload failed.");
        setSubmitting(false);
        return;
      }

      image_path = path;
    }

    const { error } = await onSave({
      title,
      link_url: linkUrl,
      placement,
      image_path,
      start_date: startDate || null,
      end_date: endDate || null,
      is_paid_ad: isPaidAd,
      payment_status: isPaidAd ? paymentStatus : "n/a",
      amount_charged: isPaidAd && amountCharged ? parseFloat(amountCharged) : null,
    });

    setSubmitting(false);

    if (error) {
      alert(error);
      return;
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-4">
      <h3 className="text-white font-semibold mb-4">Edit Ad</h3>

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
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => setIsPaidAd(!isPaidAd)}
          className={`px-4 py-2 rounded-lg font-semibold text-sm border transition ${
            isPaidAd
              ? "bg-blue-950 border-blue-700 text-blue-400"
              : "bg-zinc-800 border-zinc-700 text-gray-400"
          }`}
        >
          {isPaidAd ? "Paid Ad" : "House Ad (free)"}
        </button>
      </div>

      {isPaidAd && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
            >
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Amount Charged ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amountCharged}
              onChange={(e) => setAmountCharged(e.target.value)}
              className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white"
            />
          </div>
        </div>
      )}

      <label className="block text-sm text-gray-400 mb-2">
        Replace Image (optional — leave blank to keep current image)
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 text-white mb-4"
      />

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="bg-white text-black px-5 py-2.5 rounded font-semibold disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="bg-zinc-800 text-gray-300 px-5 py-2.5 rounded font-semibold hover:bg-zinc-700 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}