"use client";

import { useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useEmployerVerifications } from "@/hooks/useEmployerVerifications";
import { useUnionVerifications } from "@/hooks/useUnionVerifications";
import { useAds } from "@/hooks/useAds";
import { useAdRequests } from "@/hooks/useAdRequests";
import { useGeneralRequests } from "@/hooks/useGeneralRequests";
import { EmployerVerificationCard } from "@/components/admin/EmployerVerificationCard";
import { UnionVerificationCard } from "@/components/admin/UnionVerificationCard";
import { AdForm } from "@/components/admin/AdForm";
import { AdListItem } from "@/components/admin/AdListItem";
import { AdRequestCard } from "@/components/admin/AdRequestCard";
import { GeneralRequestCard } from "@/components/admin/GeneralRequestCard";

type AdminTab = "requests" | "employers" | "union" | "ad-requests" | "ads";

export default function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<AdminTab>("requests");

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

  const {
    ads,
    loading: loadingAds,
    createAd,
    updateAd,
    toggleActive,
    deleteAd,
    reload: reloadAds,
  } = useAds();

  const {
    pending: pendingAdRequests,
    loading: loadingAdRequests,
    approve: approveAdRequest,
    reject: rejectAdRequest,
  } = useAdRequests();

  const {
    pending: pendingGeneralRequests,
    loading: loadingGeneralRequests,
    resolve: resolveGeneralRequest,
    dismiss: dismissGeneralRequest,
  } = useGeneralRequests();

  // A decision on an ad request changes a sponsored_listings row, so the ad
  // manager list below has to reload too — otherwise a just-approved ad is
  // missing from it until a page refresh.
  async function handleApproveAdRequest(
    id: string,
    overrides: Parameters<typeof approveAdRequest>[1]
  ) {
    const result = await approveAdRequest(id, overrides);
    if (!result.error) await reloadAds();
    return result;
  }

  async function handleRejectAdRequest(id: string, reason: string) {
    const result = await rejectAdRequest(id, reason);
    if (!result.error) await reloadAds();
    return result;
  }

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

  // Brand submissions get their own tab; All Requests keeps showing both kinds.
  // Filtered client-side from the one pending query rather than a second round
  // trip.
  const brandAdRequests = pendingAdRequests.filter((r) => r.source === "brand");

  const totalPendingRequests =
    pendingEmployers.length +
    pendingUnionWorkers.length +
    pendingAdRequests.length +
    pendingGeneralRequests.length;

  const anyRequestsLoading =
    loadingEmployers || loadingUnionWorkers || loadingAdRequests || loadingGeneralRequests;

  return (
    <div className="max-w-4xl">
      <h1 className="text-5xl font-bold mb-8 text-white">Admin Panel</h1>

      <div className="flex gap-2 mb-8 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "requests"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          All Requests
          {totalPendingRequests > 0 && (
            <span className="ml-2 bg-zinc-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalPendingRequests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("employers")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "employers"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Employer Verification
        </button>
        <button
          onClick={() => setActiveTab("union")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "union"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Union Verification
        </button>
        <button
          onClick={() => setActiveTab("ad-requests")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "ad-requests"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Advertisement Requests
          {brandAdRequests.length > 0 && (
            <span className="ml-2 bg-zinc-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {brandAdRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("ads")}
          className={`px-5 py-3 font-semibold border-b-2 transition ${
            activeTab === "ads"
              ? "border-brand text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Ads
        </button>
      </div>

      {activeTab === "requests" && (
        <div className="space-y-8">
          {anyRequestsLoading && <p className="text-gray-400">Loading...</p>}

          {!anyRequestsLoading && totalPendingRequests === 0 && (
            <p className="text-gray-400">No pending requests.</p>
          )}

          {pendingEmployers.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
                Employer Verifications
              </h3>
              <div className="space-y-4">
                {pendingEmployers.map((employer) => (
                  <EmployerVerificationCard
                    key={employer.document_id}
                    employer={employer}
                    onApprove={approveEmployer}
                    onReject={rejectEmployer}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingUnionWorkers.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
                Union Verifications
              </h3>
              <div className="space-y-4">
                {pendingUnionWorkers.map((worker) => (
                  <UnionVerificationCard
                    key={worker.id}
                    worker={worker}
                    onApprove={approveUnionWorker}
                    onReject={rejectUnionWorker}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingAdRequests.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
                Ad Requests
              </h3>
              <div className="space-y-4">
                {pendingAdRequests.map((request) => (
                  <AdRequestCard
                    key={request.id}
                    request={request}
                    onApprove={handleApproveAdRequest}
                    onReject={handleRejectAdRequest}
                  />
                ))}
              </div>
            </div>
          )}

          {pendingGeneralRequests.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
                General Concerns
              </h3>
              <div className="space-y-4">
                {pendingGeneralRequests.map((request) => (
                  <GeneralRequestCard
                    key={request.id}
                    request={request}
                    onResolve={resolveGeneralRequest}
                    onDismiss={dismissGeneralRequest}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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

      {activeTab === "ad-requests" && (
        <div className="space-y-4">
          {loadingAdRequests && <p className="text-gray-400">Loading...</p>}
          {!loadingAdRequests && brandAdRequests.length === 0 && (
            <p className="text-gray-400">No ads waiting for review.</p>
          )}
          {brandAdRequests.map((request) => (
            <AdRequestCard
              key={request.id}
              request={request}
              onApprove={handleApproveAdRequest}
              onReject={handleRejectAdRequest}
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