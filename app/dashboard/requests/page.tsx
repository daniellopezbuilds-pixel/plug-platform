"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyRequests } from "@/hooks/useMyRequests";
import { SubmitAdRequest } from "@/components/requests/SubmitAdRequest";
import { SubmitGeneralConcern } from "@/components/requests/SubmitGeneralConcern";
import { MyRequestsList } from "@/components/requests/MyRequestsList";

type RequestsTab = "submit" | "history";
type SubmitType = "menu" | "employer" | "union" | "ad" | "general";

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<RequestsTab>("submit");
  const [submitType, setSubmitType] = useState<SubmitType>("menu");

  const { requests, loading, reload } = useMyRequests();

  function handleSubmitted() {
    setSubmitType("menu");
    reload();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-5xl font-bold text-white mb-8">Requests</h1>

      <div className="flex gap-2 mb-8 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("submit")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "submit"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Submit a Request
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "history"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          My Requests
        </button>
      </div>

      {activeTab === "submit" && (
        <div>
          {submitType === "menu" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href="/dashboard/profile"
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition"
              >
                <h3 className="text-white font-semibold mb-1">Employer Verification</h3>
                <p className="text-gray-400 text-sm">
                  Upload your verification document on your Profile page.
                </p>
              </Link>

              <Link
                href="/dashboard/profile"
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition"
              >
                <h3 className="text-white font-semibold mb-1">Union Verification</h3>
                <p className="text-gray-400 text-sm">
                  Set your union status on your Profile page for admin review.
                </p>
              </Link>

              <button
                onClick={() => setSubmitType("ad")}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition"
              >
                <h3 className="text-white font-semibold mb-1">Ad Request</h3>
                <p className="text-gray-400 text-sm">
                  Submit an ad to run on the Jobs Board or Marketplace.
                </p>
              </button>

              <button
                onClick={() => setSubmitType("general")}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-700 transition"
              >
                <h3 className="text-white font-semibold mb-1">General Concern</h3>
                <p className="text-gray-400 text-sm">
                  Report an issue or ask the admin team something else.
                </p>
              </button>
            </div>
          )}

          {submitType === "ad" && (
            <div>
              <button
                onClick={() => setSubmitType("menu")}
                className="text-gray-400 hover:text-white text-sm mb-4"
              >
                ← Back
              </button>
              <SubmitAdRequest onSubmitted={handleSubmitted} />
            </div>
          )}

          {submitType === "general" && (
            <div>
              <button
                onClick={() => setSubmitType("menu")}
                className="text-gray-400 hover:text-white text-sm mb-4"
              >
                ← Back
              </button>
              <SubmitGeneralConcern onSubmitted={handleSubmitted} />
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <MyRequestsList requests={requests} loading={loading} />
      )}
    </div>
  );
}