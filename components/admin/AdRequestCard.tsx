"use client";

import { useState } from "react";
import { getAdPublicUrl } from "@/lib/ads";
import type { AdRequest } from "@/hooks/useAdRequests";

export function AdRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: AdRequest;
  onApprove: (
    id: string,
    overrides: {
      start_date: string;
      end_date: string;
      is_paid_ad: boolean;
      payment_status: string;
      amount_charged: number | null;
    }
  ) => Promise<{ error: string | null }>;
  onReject: (id: string) => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const defaultEnd = new Date();
  defaultEnd.setDate(defaultEnd.getDate() + 30);

  const [startDate, setStartDate] = useState(request.start_date || today);
  const [endDate, setEndDate] = useState(
    request.end_date || defaultEnd.toISOString().split("T")[0]
  );
  const [isPaidAd, setIsPaidAd] = useState(request.is_paid_ad || false);
  const [paymentStatus, setPaymentStatus] = useState(request.payment_status || "n/a");
  const [amountCharged, setAmountCharged] = useState(
    request.amount_charged?.toString() || ""
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleApprove() {
    if (!startDate || !endDate) {
      alert("Start and end dates are required.");
      return;
    }

    setSubmitting(true);

    const { error } = await onApprove(request.id, {
      start_date: startDate,
      end_date: endDate,
      is_paid_ad: isPaidAd,
      payment_status: isPaidAd ? paymentStatus : "n/a",
      amount_charged: isPaidAd && amountCharged ? parseFloat(amountCharged) : null,
    });

    setSubmitting(false);

    if (error) {
      alert(error);
    }
  }

  const linkLabel = request.link_url;

  const placementLabel =
    request.placement === "jobs_board"
      ? "Jobs Board"
      : request.placement === "marketplace"
      ? "Marketplace"
      : "Feed";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="flex items-center gap-4 mb-4">
        <img
          src={getAdPublicUrl(request.image_path)}
          alt={request.title}
          className="w-24 h-16 rounded object-cover border border-zinc-700"
        />
        <div className="flex-1">
          <h4 className="text-white font-semibold">{request.title}</h4>
          <p className="text-gray-400 text-sm">
            {placementLabel}
            {linkLabel && (
              <span>
                {" "}
                ·{" "}
                
                  <a href={linkLabel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  {linkLabel}
                </a>
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full p-2.5 rounded bg-zinc-800 border border-zinc-700 text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full p-2.5 rounded bg-zinc-800 border border-zinc-700 text-white text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
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
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              className="w-full p-2.5 rounded bg-zinc-800 border border-zinc-700 text-white text-sm"
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
              className="w-full p-2.5 rounded bg-zinc-800 border border-zinc-700 text-white text-sm"
            />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="bg-green-950 text-green-400 border border-green-800 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-green-900 transition disabled:opacity-50"
        >
          {submitting ? "Approving..." : "Approve"}
        </button>
        <button
          onClick={() => onReject(request.id)}
          className="bg-red-950 text-red-400 border border-red-800 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-900 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
}