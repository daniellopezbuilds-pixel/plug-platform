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
import { PageHeading } from "@/components/layout/PageHeading";
import { PageLoader } from "@/components/ui/Loading";
import { InlineLoader } from "@/components/ui/Loading";

type AdminTab = "requests" | "employers" | "union" | "ad-requests" | "ads";


/**
 * Tab styling, matching the sidebar active treatment: orange label, orange
 * bar. The bar is border-b here rather than border-l because these are a
 * horizontal strip, but it is the same accent token at the same weight.
 *
 * border-b-2 is always present and merely transparent when inactive, so
 * switching tabs does not shift the labels vertically.
 */
function tabClass(active: boolean) {
  return [
    "px-5 py-3 font-semibold border-b-2 transition whitespace-nowrap shrink-0",
    active
      ? "border-accent text-accent"
      : "border-transparent text-gray-400 hover:text-white",
  ].join(" ");
}

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
    return <PageLoader message="Checking permissions" />;
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
    <div className="max-w-4xl mx-auto">
      <PageHeading title="Admin Panel" />

      <div className="flex gap-2 mb-8 border-b border-zinc-800 overflow-x-auto scrollbar-dark -mx-4 px-4 md:mx-0 md:px-0">
        <button
          onClick={() => setActiveTab("requests")}
          className={tabClass(activeTab === "requests")}
        >
          All Requests
          {totalPendingRequests > 0 && (
            <span className="ml-2 bg-accent-2 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {totalPendingRequests}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("employers")}
          className={tabClass(activeTab === "employers")}
        >
          Employer Verification
        </button>
        <button
          onClick={() => setActiveTab("union")}
          className={tabClass(activeTab === "union")}
        >
          Union Verification
        </button>
        <button
          onClick={() => setActiveTab("ad-requests")}
          className={tabClass(activeTab === "ad-requests")}
        >
          Advertisement Requests
          {brandAdRequests.length > 0 && (
            <span className="ml-2 bg-accent-2 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {brandAdRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("ads")}
          className={tabClass(activeTab === "ads")}
        >
          Ads
        </button>
      </div>

      {activeTab === "requests" && (
        <div className="space-y-8">
          {anyRequestsLoading && <InlineLoader message="Loading requests" />}

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
          {loadingEmployers && <InlineLoader message="Loading verifications" />}
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
          {loadingUnionWorkers && <InlineLoader message="Loading verifications" />}
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
          {loadingAdRequests && <InlineLoader message="Loading ad requests" />}
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
            {loadingAds && <InlineLoader message="Loading ads" />}
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