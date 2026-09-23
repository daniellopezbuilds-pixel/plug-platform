"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { excludeInternalAccounts } from "@/lib/internalAccounts";

export type SuggestedPerson = {
  id: string;
  full_name: string | null;
  trade: string | null;
  location: string | null;
  company_logo_path: string | null;
  signup_type: string | null;
};

/**
 * A handful of recent members you are not yet connected to.
 *
 * HONESTLY NAMED "new on Sparx Plug", not "people you may know". There is no
 * signal here beyond recency — no shared connections, no shared employer — and
 * a heading that implies a recommendation engine would be claiming one.
 *
 * `excludeIds` is everyone the viewer already has a connection row with, in
 * any state, from useConnections; `ready` is that hook having loaded. Fetches
 * more than it shows so that filtering those out still fills the card.
 * Internal and demo accounts are excluded the same way the directory does.
 *
 * THE EXCLUSION IS APPLIED ONCE, when the list loads, and deliberately not
 * again. Clicking Connect adds that person to the connection map; filtering
 * against the live map would remove them from the card mid-click. They stay,
 * shown as Requested, until the next visit.
 */
export function useSuggestedPeople(
  userId: string | null,
  excludeIds: { has(id: string): boolean },
  ready: boolean,
  show = 4
) {
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !ready) return;
    let cancelled = false;

    let query = supabase
      .from("profiles")
      .select("id, full_name, trade, location, company_logo_path, signup_type");

    query = excludeInternalAccounts(query)
      .neq("id", userId)
      .order("created_at", { ascending: false })
      .limit(show + 12);

    query.then(({ data }) => {
      if (cancelled) return;
      const rows = (data as SuggestedPerson[]) ?? [];
      setPeople(rows.filter((p) => !excludeIds.has(p.id)).slice(0, show));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // excludeIds omitted on purpose — see "applied once" above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready, show]);

  return { people, loading: loading || !ready };
}
