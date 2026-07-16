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
  } | null;
};

export function useConnections() {
  const [connectionMap, setConnectionMap] = useState<Map<string, ConnectionInfo>>(new Map());
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
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

    const { data: incoming } = await supabase
      .from("connections")
      .select(
        `
        id,
        created_at,
        requester:profiles!connections_requester_id_fkey (
          id,
          full_name,
          profile_number,
          trade
        )
      `
      )
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (incoming) setIncomingRequests(incoming as unknown as IncomingRequest[]);

    setLoading(false);
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
    setConnectionMap((prev) =>
      new Map(prev).set(requesterId, { id: connectionId, status, direction: "received" })
    );

    return { error: null };
  }

  return {
    connectionMap,
    incomingRequests,
    loading,
    actingId,
    sendRequest,
    respondToRequest,
    refresh: load,
  };
}