"use client";

import { useProfileBadge } from "@/hooks/useProfileBadges";
import { VerifiedCheck } from "./VerifiedCheck";

/**
 * Just the verified shield for a profile, for places that show a name without
 * the account-type label NameMeta adds — inbox rows, rail lists, cards with
 * the type shown elsewhere.
 *
 * Reads the same batched badge store as NameMeta, so a list of twenty rows is
 * one query, not twenty.
 */
export function VerifiedMark({ profileId }: { profileId: string | null | undefined }) {
  const { verified, markerIcon, markerTitle } = useProfileBadge(profileId);
  return <VerifiedCheck verified={verified} icon={markerIcon} title={markerTitle} />;
}
