"use client";

import { useState } from "react";
import { useDirectory } from "@/hooks/useDirectory";
import { useConnections } from "@/hooks/useConnections";
import { usePublicAds } from "@/hooks/usePublicAds";
import { ProfileCard } from "@/components/marketplace/ProfileCard";
import { ConnectionRequestsPanel } from "@/components/marketplace/ConnectionRequestCard";
import { DirectoryFilters } from "@/components/marketplace/DirectoryFilters";
import { SponsoredRail } from "@/components/ads/SponsoredRail";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListError } from "@/components/ui/ListError";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { LoadMore } from "@/components/ui/LoadMore";

/**
 * My Local Network.
 *
 * THE MAIN COLUMN IS THE PEOPLE, TWO ACROSS. Three across left each card
 * stretched with its action stranded on a row of its own; two gives each
 * person room without dead space. One column below 1024.
 *
 * CONNECTION REQUESTS SIT ABOVE THE CARDS, at every width. They briefly lived
 * in the right rail, where a pending request read as a sidebar number rather
 * than something waiting on you — they are the one thing on this page that
 * needs an answer.
 *
 *   under 1280    heading, requests, sponsored slot, a Filters toggle, cards
 *   1280-1719     requests + cards | sponsored, filters
 *   1720 and up   filters (352px, so the union tiles fit) | requests + cards | sponsored
 *
 * Rails are sticky and scroll on their own — see RailColumns.
 */
export default function MarketplacePage() {
  const toast = useToast();
  const {
    profiles,
    loading: profilesLoading,
    loadingMore,
    hasMore,
    loadMore,
    trade,
    setTrade,
    location,
    setLocation,
    unionStatus,
    setUnionStatus,
    error: directoryError,
    refresh: reloadDirectory,
  } = useDirectory();

  const {
    connectionMap,
    incomingRequests,
    incomingTotal,
    hasMoreIncoming,
    loadingMoreIncoming,
    loadMoreIncoming,
    loading: connectionsLoading,
    actingId,
    sendRequest,
    respondToRequest,
  } = useConnections();

  const { ad, adIndex, adCount, selectAd, loading: adLoading } = usePublicAds("marketplace");
  const { withRail, split } = useRailBreakpoints();
  const [filtersOpen, setFiltersOpen] = useState(false);

  async function handleConnect(recipientId: string) {
    const { error } = await sendRequest(recipientId);
    if (error) toast.error(error);
  }

  async function handleRespond(
    connectionId: string,
    requesterId: string,
    status: "accepted" | "rejected"
  ) {
    const { error } = await respondToRequest(connectionId, requesterId, status);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(status === "accepted" ? "Connection accepted." : "Request declined.");
  }

  const loading = profilesLoading || connectionsLoading;
  const activeFilters = [trade.trim(), location, unionStatus].filter(Boolean).length;

  function clearFilters() {
    setTrade("");
    setLocation("");
    setUnionStatus(null);
  }

  const sponsored = (
    <SponsoredRail ad={ad} index={adIndex} total={adCount} onSelect={selectAd} loading={adLoading} />
  );

  const requests = (
    <ConnectionRequestsPanel
      requests={incomingRequests}
      total={incomingTotal}
      hasMore={hasMoreIncoming}
      loadingMore={loadingMoreIncoming}
      onLoadMore={loadMoreIncoming}
      actingId={actingId}
      onRespond={handleRespond}
    />
  );

  const filters = (idPrefix: string) => (
    <DirectoryFilters
      idPrefix={idPrefix}
      trade={trade}
      onTrade={setTrade}
      location={location}
      onLocation={setLocation}
      union={unionStatus}
      onUnion={setUnionStatus}
    />
  );

  return (
    <RailColumns
      withRail={withRail}
      split={split}
      leftLabel="Filters"
      left={filters("network-filter-left")}
      leftWidth={352}
      rightLabel="Sponsored and filters"
      right={
        <>
          {sponsored}
          {!split && filters("network-filter-right")}
        </>
      }
    >
      <PageHeading
        title="My Local Network"
        size="compact"
        subtitle="Electricians, contractors and instructors on Sparx Plug."
      />

      <div className="mb-4 empty:hidden">{requests}</div>

      {!withRail && (
        <>
          <div className="mb-4 empty:hidden">{sponsored}</div>

          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${
                activeFilters > 0 || filtersOpen
                  ? "border-accent text-white"
                  : "border-zinc-700 text-gray-300 hover:border-zinc-500"
              }`}
            >
              Filters
              {activeFilters > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">
                  {activeFilters}
                </span>
              )}
              <Icon
                name="chevronDown"
                className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-lg px-3 text-sm font-semibold text-accent-2-soft transition hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {filtersOpen && <div className="mb-4">{filters("network-filter-top")}</div>}
        </>
      )}

      {loading ? (
        <CardSkeleton />
      ) : directoryError ? (
        <ListError what="the directory" message={directoryError} onRetry={reloadDirectory} />
      ) : profiles.length === 0 ? (
        activeFilters > 0 ? (
          <EmptyState
            icon="userGroup"
            title="Nobody matches these filters"
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-lg border border-zinc-700 px-5 font-semibold text-white transition hover:border-zinc-500"
              >
                Clear filters
              </button>
            }
          >
            Try a broader trade or a different city.
          </EmptyState>
        ) : (
          <EmptyState icon="userGroup" title="No one here yet">
            As electricians and contractors join Sparx Plug they appear here.
          </EmptyState>
        )
      ) : (
        <>
          {/* Two across from 1024, one below — never three. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                connection={connectionMap.get(profile.id)}
                isActing={actingId === profile.id}
                onConnect={handleConnect}
                onAccept={(connectionId, requesterId) =>
                  handleRespond(connectionId, requesterId, "accepted")
                }
              />
            ))}
          </div>

          {/* Outside the grid, so the sentinel is not laid out as a card. */}
          <LoadMore
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            endMessage="That's everyone nearby."
            showEndMessage={profiles.length >= 24}
          />
        </>
      )}
    </RailColumns>
  );
}
