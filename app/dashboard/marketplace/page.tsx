"use client";

import { useDirectory } from "@/hooks/useDirectory";
import { useConnections } from "@/hooks/useConnections";
import { ProfileCard } from "@/components/marketplace/ProfileCard";
import { ConnectionRequestCard } from "@/components/marketplace/ConnectionRequestCard";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageWithSponsoredRail } from "@/components/ads/PageWithSponsoredRail";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { SectionHeading } from "@/components/ui/SectionHeading";

export default function MarketplacePage() {
  const {
    profiles,
    loading: profilesLoading,
    trade,
    setTrade,
    location,
    setLocation,
    unionStatus,
    setUnionStatus,
  } = useDirectory();

  const {
    connectionMap,
    incomingRequests,
    loading: connectionsLoading,
    actingId,
    sendRequest,
    respondToRequest,
  } = useConnections();

  async function handleConnect(recipientId: string) {
    const { error } = await sendRequest(recipientId);
    if (error) alert(error);
  }

  async function handleRespond(
    connectionId: string,
    requesterId: string,
    status: "accepted" | "rejected"
  ) {
    const { error } = await respondToRequest(connectionId, requesterId, status);
    if (error) alert(error);
  }

  const loading = profilesLoading || connectionsLoading;

  return (
    <div>

      <PageWithSponsoredRail
        placement="marketplace"
        heading={<PageHeading title="My Local Network" />}
      >
        {incomingRequests.length > 0 && (
          <section className="mb-10">
            <SectionHeading>
              Connection Requests ({incomingRequests.length})
            </SectionHeading>
            {/* Same column rhythm as the profile grid below, so the two
                sections line up rather than one being a list and the other a
                grid. A request card is a name and two buttons — it does not
                need a full row. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-4">
              {incomingRequests.map((req) => (
                <ConnectionRequestCard
                  key={req.id}
                  request={req}
                  isActing={actingId === req.id}
                  onRespond={handleRespond}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading>Discover</SectionHeading>

          <div className="flex flex-wrap gap-3 mb-8">
            <input
              type="text"
              placeholder="Filter by trade"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="p-3 rounded bg-zinc-900 border border-zinc-800 text-white flex-1 min-w-[180px]"
            />
            <input
              type="text"
              placeholder="Filter by location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="p-3 rounded bg-zinc-900 border border-zinc-800 text-white flex-1 min-w-[180px]"
            />
            <select
              value={unionStatus || ""}
              onChange={(e) => setUnionStatus(e.target.value || null)}
              className="p-3 rounded bg-zinc-900 border border-zinc-800 text-white"
            >
              <option value="">Any Union Status</option>
              <option value="union">Union</option>
              <option value="non_union">Non-Union</option>
            </select>
          </div>

          {loading ? (
            <CardSkeleton />
          ) : profiles.length === 0 ? (
            <p className="text-gray-400">No profiles match these filters.</p>
          ) : (
            // Column count tracks how much width the rail leaves, which is not
            // a straight line:
            //   < lg    one column
            //   lg–xl   two — the rail is stacked above, so this column is full
            //           width (~688px at 1024, ~944px at 1279)
            //   xl      back to one — the rail takes 320px and this column
            //           drops to ~592px, where two cards would be ~280px each
            //   2xl+    two again — ~848px at 1536, ~1168px at 1920
            //
            // lg rather than md for the two-column step. At exactly 768 the
            // sidebar stops being a drawer and becomes a static 256px column,
            // so the content area COLLAPSES from 343px to 432px-wide-total —
            // the narrowest the page ever gets on a real device. Two cards
            // there were about 204px each. That pinch is a property of the
            // shell, not of this grid, but this grid should not make it worse.
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-6">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  connection={connectionMap.get(profile.id)}
                  isActing={actingId === profile.id}
                  onConnect={handleConnect}
                />
              ))}
            </div>
          )}
        </section>
      </PageWithSponsoredRail>
    </div>
  );
}
