"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { excludeInternalAccounts } from "@/lib/internalAccounts";
import { usePagedList } from "./usePagedList";

export type DirectoryProfile = {
  id: string;
  full_name: string | null;
  profile_number: string | null;
  trade: string | null;
  location: string | null;
  bio: string | null;
  union_status: string | null;
  union_verified: boolean | null;
  active_role: string | null;
  years_experience: string | null;
  resume_path: string | null;
  company_logo_path: string | null;
  company_description: string | null;
  company_website: string | null;
  employer_verified: boolean | null;
  signup_type: string | null;
};

const COLUMNS =
  "id, full_name, profile_number, trade, location, bio, union_status, union_verified, active_role, years_experience, resume_path, company_logo_path, company_description, company_website, employer_verified, signup_type";

/**
 * 24: three full rows at the widest grid and eight at the narrowest, so the
 * first page fills the screen at any width without a second request.
 */
const PAGE_SIZE = 24;

/**
 * My Local Network.
 *
 * TWO THINGS THIS DOES THAT IT DID NOT BEFORE.
 *
 * 1. Internal accounts are excluded. Demo profiles and the team's own logins
 *    were being shown to real electricians as people they could hire or work
 *    for. The list is lib/internalAccounts.tsx, shared with the daily summary
 *    email rather than copied.
 *
 * 2. It pages. It used to select every profile on the platform, unbounded, and
 *    render all of them — fine at eleven rows and a full table scan plus a full
 *    payload at ten thousand.
 */
export function useDirectory() {
  const [userId, setUserId] = useState<string | null>(null);
  const [resolvingUser, setResolvingUser] = useState(true);

  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");
  const [unionStatus, setUnionStatus] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setResolvingUser(false);
    });
  }, []);

  /**
   * Trimmed here rather than inside fetchPage, so the identity of this
   * callback — and therefore whether the list refetches — depends on the
   * meaningful value and not on trailing whitespace as it is typed.
   */
  const tradeFilter = trade.trim();
  const locationFilter = location.trim();

  const fetchPage = useCallback(
    async (offset: number, limit: number | null) => {
      let query = supabase.from("profiles").select(COLUMNS);

      query = excludeInternalAccounts(query);

      // Your own profile is not part of your network. Kept as a filter rather
      // than dropped after the fetch so it does not eat a slot in the page.
      if (userId) query = query.neq("id", userId);

      if (tradeFilter) query = query.ilike("trade", `%${tradeFilter}%`);
      if (locationFilter) query = query.ilike("location", `%${locationFilter}%`);
      if (unionStatus) query = query.eq("union_status", unionStatus);

      query = query.order("created_at", { ascending: false });
      if (limit) query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;
      return { data: (data as DirectoryProfile[]) ?? null, error };
    },
    [userId, tradeFilter, locationFilter, unionStatus]
  );

  const paged = usePagedList<DirectoryProfile>({
    pageSize: PAGE_SIZE,
    fetchPage,
    getId: (p) => p.id,
    // Waiting on getUser(). Querying first would show the viewer their own
    // card for a moment and then remove it.
    skip: resolvingUser,
  });

  return {
    profiles: paged.items,
    loading: paged.loading,
    loadingMore: paged.loadingMore,
    hasMore: paged.hasMore,
    loadMore: paged.loadMore,
    trade,
    setTrade,
    location,
    setLocation,
    unionStatus,
    setUnionStatus,
    refresh: paged.reload,
  };
}
