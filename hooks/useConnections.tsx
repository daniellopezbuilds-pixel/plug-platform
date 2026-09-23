"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ConnectionInfo = {
  id: string;
  status: string;
  direction: "sent" | "received";
};

export type IncomingRequest = {
  id: string;
  created_at: string;
  requester: {
    id: string;
    full_name: string | null;
    profile_number: string | null;
    trade: string | null;
    signup_type: string | null;
    company_logo_path: string | null;
  } | null;
};

/** Incoming requests fetched per page. Few people have more than a handful. */
const INCOMING_PAGE_SIZE = 5;

const INCOMING_COLUMNS = `
  id,
  created_at,
  requester:profiles!connections_requester_id_fkey (
    id,
    full_name,
    profile_number,
    trade,
    signup_type,
    company_logo_path
  )
`;

/** One page of pending requests to this user, with the total from the same query. */
function incomingPage(recipientId: string, offset: number) {
  return supabase
    .from("connections")
    .select(INCOMING_COLUMNS, { count: "exact" })
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + INCOMING_PAGE_SIZE - 1)
    .then(({ data, count, error }) => ({
      data: error ? null : (data as unknown as IncomingRequest[]),
      count,
    }));
}

/**
 * Your connections, and the requests waiting on you.
 *
 * THE CONNECTION MAP IS FETCHED WHOLE, AND SHOULD BE. It is one small row per
 * relationship and it decides the button on every directory card — paging it
 * would show "Connect" beside someone you are already connected to, because
 * their row was on a later page. Same reasoning as the applied-jobs set in
 * useJobs.
 *
 * INCOMING REQUESTS ARE PAGED, five at a time, with the total taken from the
 * SAME query (count: "exact"), so the number in the panel header and the rows
 * under it cannot disagree — two separate queries for a count and a list is
 * the shape of the My Applications bug.
 */
export function useConnections() {
  const [connectionMap, setConnectionMap] = useState<Map<string, ConnectionInfo>>(new Map());
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [incomingTotal, setIncomingTotal] = useState(0);
  const [loadingMoreIncoming, setLoadingMoreIncoming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const { data } = await supabase
      .from("connections")
      .select("id, requester_id, recipient_id, status")
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

    if (data) {
      const map = new Map<string, ConnectionInfo>();
      for (const row of data) {
        const isRequester = row.requester_id === user.id;
        const otherId = isRequester ? row.recipient_id : row.requester_id;
        map.set(otherId, {
          id: row.id,
          status: row.status,
          direction: isRequester ? "sent" : "received",
        });
      }
      setConnectionMap(map);
    }

    const { data: incoming, count } = await incomingPage(user.id, 0);

    if (incoming) setIncomingRequests(incoming);
    setIncomingTotal(count ?? 0);

    setLoading(false);
  }

  async function loadMoreIncoming() {
    if (!userId || loadingMoreIncoming) return;
    setLoadingMoreIncoming(true);

    const { data, count } = await incomingPage(userId, incomingRequests.length);

    if (data) {
      // By id, in case a request arrived and shifted the window.
      setIncomingRequests((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...data.filter((r) => !seen.has(r.id))];
      });
      if (count != null) setIncomingTotal(count);
    }
    setLoadingMoreIncoming(false);
  }

  async function sendRequest(recipientId: string) {
    if (!userId) return { error: "Not logged in." };

    setActingId(recipientId);

    const { error } = await supabase
      .from("connections")
      .insert([{ requester_id: userId, recipient_id: recipientId }]);

    setActingId(null);

    if (error) {
      if (error.code === "23505") return { error: "A connection already exists." };
      return { error: error.message };
    }

    setConnectionMap((prev) =>
      new Map(prev).set(recipientId, { id: "", status: "pending", direction: "sent" })
    );

    return { error: null };
  }

  async function respondToRequest(
    connectionId: string,
    requesterId: string,
    status: "accepted" | "rejected"
  ) {
    setActingId(connectionId);

    const { error } = await supabase
      .from("connections")
      .update({ status })
      .eq("id", connectionId);

    setActingId(null);

    if (error) return { error: error.message };

    setIncomingRequests((prev) => prev.filter((r) => r.id !== connectionId));
    setIncomingTotal((n) => Math.max(0, n - 1));
    setConnectionMap((prev) =>
      new Map(prev).set(requesterId, { id: connectionId, status, direction: "received" })
    );

    return { error: null };
  }

  return {
    connectionMap,
    incomingRequests,
    /** Pending requests in total — may exceed incomingRequests.length. */
    incomingTotal,
    hasMoreIncoming: incomingRequests.length < incomingTotal,
    loadingMoreIncoming,
    loadMoreIncoming,
    loading,
    actingId,
    sendRequest,
    respondToRequest,
    refresh: load,
  };
}