"use client";

import { useDirectory } from "@/hooks/useDirectory";
import { useConnections } from "@/hooks/useConnections";
import { useActiveAd } from "@/hooks/useActiveAd";
import { ProfileCard } from "@/components/marketplace/ProfileCard";
import { ConnectionRequestCard } from "@/components/marketplace/ConnectionRequestCard";
import { AdBanner } from "@/components/jobs/AdBanner";

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

  const { ad } = useActiveAd("marketplace");

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
      <h1 className="text-5xl font-bold text-white mb-8">My Local Network</h1>

      {ad && <AdBanner ad={ad} />}

      {incomingRequests.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-white mb-4">
            Connection Requests ({incomingRequests.length})
          </h2>
          <div className="space-y-4">
            {incomingRequests.map((req) => (
              <ConnectionRequestCard
                key={req.id}
                request={req}
                isActing={actingId === req.id}
                onRespond={handleRespond}
              />
            ))}
          </div>
        </div>
      )}

      <h2 className="text-2xl font-bold text-white mb-4">Discover</h2>

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
        <div className="text-white">Loading directory...</div>
      ) : profiles.length === 0 ? (
        <p className="text-gray-400">No profiles match these filters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    </div>
  );
}