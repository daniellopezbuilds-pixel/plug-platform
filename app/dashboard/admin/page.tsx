"use client";

import { useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useEmployerVerifications } from "@/hooks/useEmployerVerifications";
import { useUnionVerifications } from "@/hooks/useUnionVerifications";
import { useAds } from "@/hooks/useAds";
import { EmployerVerificationCard } from "@/components/admin/EmployerVerificationCard";
import { UnionVerificationCard } from "@/components/admin/UnionVerificationCard";
import { AdForm } from "@/components/admin/AdForm";
import { AdListItem } from "@/components/admin/AdListItem";

type AdminTab = "employers" | "union" | "ads";

export default function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<AdminTab>("employers");

  const {
    pending: pendingEmployers,
    loading: loadingEmployers,
    approve: approveEmployer,
    reject: rejectEmployer,
  } = useEmployerVerifications();

  const {
    pending: pendingUnionWorkers,
    loading: loadingUnionWorkers,
    approve: approveUnionWorker,
    reject: rejectUnionWorker,
  } = useUnionVerifications();

  const { ads, loading: loadingAds, createAd, updateAd, toggleActive, deleteAd } = useAds();

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="text-white">
        <h1 className="text-3xl font-bold mb-2">Access Denied</h1>
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-5xl font-bold mb-8 text-white">Admin Panel</h1>

      <div className="flex gap-2 mb-8 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("employers")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "employers"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Employer Verification
        </button>
        <button
          onClick={() => setActiveTab("union")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "union"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Union Verification
        </button>
        <button
          onClick={() => setActiveTab("ads")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "ads"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Ads
        </button>
      </div>

      {activeTab === "employers" && (
        <div className="space-y-4">
          {loadingEmployers && <p className="text-gray-400">Loading...</p>}
          {!loadingEmployers && pendingEmployers.length === 0 && (
            <p className="text-gray-400">No employers awaiting verification.</p>
          )}
          {pendingEmployers.map((employer) => (
            <EmployerVerificationCard
              key={employer.document_id}
              employer={employer}
              onApprove={approveEmployer}
              onReject={rejectEmployer}
            />
          ))}
        </div>
      )}

      {activeTab === "union" && (
        <div className="space-y-4">
          {loadingUnionWorkers && <p className="text-gray-400">Loading...</p>}
          {!loadingUnionWorkers && pendingUnionWorkers.length === 0 && (
            <p className="text-gray-400">No workers awaiting union verification.</p>
          )}
          {pendingUnionWorkers.map((worker) => (
            <UnionVerificationCard
              key={worker.id}
              worker={worker}
              onApprove={approveUnionWorker}
              onReject={rejectUnionWorker}
            />
          ))}
        </div>
      )}

      {activeTab === "ads" && (
        <div>
          <AdForm onCreate={createAd} />

          <div className="space-y-3">
            {loadingAds && <p className="text-gray-400">Loading...</p>}
            {!loadingAds && ads.length === 0 && (
              <p className="text-gray-400">No ads created yet.</p>
            )}
            {ads.map((ad) => (
              <AdListItem
                key={ad.id}
                ad={ad}
                onToggleActive={toggleActive}
                onDelete={deleteAd}
                onUpdate={updateAd}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}