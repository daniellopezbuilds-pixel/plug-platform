"use client";

import { useState } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useEmployerVerifications } from "@/hooks/useEmployerVerifications";
import { useUnionVerifications } from "@/hooks/useUnionVerifications";
import { useBadgeRequests } from "@/hooks/useBadgeRequests";
import { useAds } from "@/hooks/useAds";
import { useAdRequests } from "@/hooks/useAdRequests";
import { useGeneralRequests } from "@/hooks/useGeneralRequests";
import { useAdminCounts } from "@/hooks/useAdminCounts";
import { EmployerVerificationCard } from "@/components/admin/EmployerVerificationCard";
import { UnionVerificationCard } from "@/components/admin/UnionVerificationCard";
import { BadgeRequestCard } from "@/components/admin/BadgeRequestCard";
import { CslbStalenessBanner } from "@/components/admin/CslbStalenessBanner";
import { AdForm } from "@/components/admin/AdForm";
import { AdListItem } from "@/components/admin/AdListItem";
import { AdRequestCard } from "@/components/admin/AdRequestCard";
import { GeneralRequestCard } from "@/components/admin/GeneralRequestCard";
import { PageHeading } from "@/components/layout/PageHeading";
import { Tabs } from "@/components/ui/Tabs";
import { LoadMore } from "@/components/ui/LoadMore";
import { PageLoader } from "@/components/ui/Loading";
import { InlineLoader } from "@/components/ui/Loading";

type AdminTab =
  | "requests"
  | "employers"
  | "union"
  | "badges"
  | "ad-requests"
  | "ads";


export default function AdminPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<AdminTab>("requests");

  const {
    pending: pendingEmployers,
    loading: loadingEmployers,
    loadingMore: loadingMoreEmployers,
    hasMore: hasMoreEmployers,
    loadMore: loadMoreEmployers,
    approve: approveEmployer,
    reject: rejectEmployer,
  } = useEmployerVerifications();

  const {
    pending: pendingUnionWorkers,
    loading: loadingUnionWorkers,
    loadingMore: loadingMoreUnion,
    hasMore: hasMoreUnion,
    loadMore: loadMoreUnion,
    approve: approveUnionWorker,
    reject: rejectUnionWorker,
  } = useUnionVerifications();

  const {
    pending: pendingBadgeRequests,
    importInfo: cslbImportInfo,
    loading: loadingBadgeRequests,
    loadingMore: loadingMoreBadgeRequests,
    hasMore: hasMoreBadgeRequests,
    loadMore: loadMoreBadgeRequests,
    error: badgeRequestsError,
    approve: approveBadgeRequest,
    reject: rejectBadgeRequest,
  } = useBadgeRequests();

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
    loadingMore: loadingMoreAdRequests,
    hasMore: hasMoreAdRequests,
    loadMore: loadMoreAdRequests,
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

  /**
   * THE BADGES COUNT THE DATABASE, NOT THE ARRAYS ON SCREEN.
   *
   * These used to be `pendingEmployers.length` and friends, which was only
   * ever right because the queue hooks fetched every pending row. They page
   * now, so an array's length is one page — useAdminCounts asks for the real
   * figure and keeps it live over realtime. See hooks/useAdminCounts.tsx.
   *
   * ABOVE THE EARLY RETURNS, because it is a hook: the two `return`s below
   * are conditional, and a hook called after them runs on some renders and not
   * others. It takes isAdmin and does nothing until that is true, which is how
   * it avoids querying for a visitor who is about to be refused.
   */
  const { counts } = useAdminCounts(isAdmin);

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
    counts.employers + counts.union + counts.adRequests + counts.generalRequests;

  const anyRequestsLoading =
    loadingEmployers || loadingUnionWorkers || loadingAdRequests || loadingGeneralRequests;

  return (
    <div className="max-w-4xl mx-auto">
      {/* THE ONE NUMBER AN ADMIN NEEDS BEFORE OPENING ANYTHING: is there work?
          Distinct items, not the sum of the tab badges — All Requests already
          aggregates four queues and the brand slice is part of a fifth, so
          adding the badges up would count most items twice. See the `total`
          note in useAdminCounts.

          Rendered as heading actions rather than a bar of its own: it is one
          fact about the page, and it belongs on the same line as the page's
          name. */}
      <PageHeading
        title="Admin Panel"
        actions={
          counts.total > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent">
              <span
                className="w-2 h-2 rounded-full bg-accent"
                aria-hidden
              />
              {counts.total} waiting
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-zinc-800 px-4 py-2 text-sm font-semibold text-gray-400">
              Nothing waiting
            </span>
          )
        }
      />

      {/* Counts live on the tab defs rather than in the markup, so the strip is
          data and the component that draws it is shared with the profile
          editor. See components/ui/Tabs.tsx. */}
      <Tabs
        tabs={[
          { key: "requests", label: "All Requests", badge: totalPendingRequests },
          { key: "employers", label: "Employer Verification", badge: counts.employers },
          { key: "union", label: "Union Verification", badge: counts.union },
          { key: "badges", label: "Badge Requests", badge: counts.badges },
          {
            key: "ad-requests",
            label: "Advertisement Requests",
            badge: counts.brandAdRequests,
          },
          { key: "ads", label: "Ads" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

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

          <LoadMore
            hasMore={hasMoreEmployers}
            loadingMore={loadingMoreEmployers}
            onLoadMore={loadMoreEmployers}
            endMessage=""
            showEndMessage={false}
          />
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

          <LoadMore
            hasMore={hasMoreUnion}
            loadingMore={loadingMoreUnion}
            onLoadMore={loadMoreUnion}
            endMessage=""
            showEndMessage={false}
          />
        </div>
      )}

      {activeTab === "badges" && (
        <div>
          {/* Above the queue, not inside it. The warning matters most exactly
              when the list is empty -- a stale file with nothing pending still
              means no new contractor can verify. */}
          <CslbStalenessBanner info={cslbImportInfo} />

          <div className="space-y-4">
            {loadingBadgeRequests && (
              <InlineLoader message="Loading badge requests" />
            )}
            {!loadingBadgeRequests && badgeRequestsError && (
              <p className="text-red-300">
                Could not load the review queue: {badgeRequestsError}
              </p>
            )}
            {!loadingBadgeRequests &&
              !badgeRequestsError &&
              pendingBadgeRequests.length === 0 && (
                <p className="text-gray-400">No licences awaiting review.</p>
              )}
            {pendingBadgeRequests.map((request) => (
              <BadgeRequestCard
                key={request.id}
                request={request}
                onApprove={approveBadgeRequest}
                onReject={rejectBadgeRequest}
              />
            ))}

            <LoadMore
              hasMore={hasMoreBadgeRequests}
              loadingMore={loadingMoreBadgeRequests}
              onLoadMore={loadMoreBadgeRequests}
              showEndMessage={false}
            />
          </div>
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

          <LoadMore
            hasMore={hasMoreAdRequests}
            loadingMore={loadingMoreAdRequests}
            onLoadMore={loadMoreAdRequests}
            endMessage=""
            showEndMessage={false}
          />
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