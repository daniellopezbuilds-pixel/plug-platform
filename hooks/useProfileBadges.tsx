"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Badges for a profile, batched across every card on the page.
 *
 * THE PROBLEM THIS SOLVES. The check mark has to appear beside a name in
 * twelve places — feed posts, comments, applicant cards, applications,
 * connections, the marketplace, reviews, three admin cards and both profile
 * views. Those render from unrelated parents, so threading a badge list down
 * from each one means twelve separate wirings, and letting each card fetch for
 * itself means one request per name on screen.
 *
 * So the fetch is shared rather than owned by a component. Cards ask for one
 * profile id; ids asked for in the same tick are collected and sent as a single
 * `in` query on the next microtask, and the result is cached for the life of
 * the page. Twenty names on the feed produce one request.
 *
 * WHY NOT A DENORMALISED COLUMN ON profiles. A boolean like
 * profiles.has_verified_badge would make this free, and it would be wrong the
 * moment a licence expired: expiry is derived from expires_at at read time and
 * nothing writes a status when a date passes, by design — see section 4 of
 * 20260916130000_badges.sql. A stored flag would need a writer that does not
 * exist, which is the exact mistake that column would repeat.
 *
 * Reads public.public_badges, never public.user_badges. The view exposes only
 * currently-valid badges on active badge types, and carries no licence numbers
 * or rejection reasons — user_badges itself is readable only by its owner and
 * by admins.
 */

type PublicBadge = {
  profile_id: string;
  badge_key: string;
  category: string;
};

/**
 * Resolved badges, by profile id. An id present with an empty array means
 * "fetched, holds nothing" — distinct from absent, which means "not fetched" —
 * so profiles with no badges are not re-requested on every render.
 */
const cache = new Map<string, PublicBadge[]>();

const waiting = new Set<string>();
const subscribers = new Set<() => void>();
let scheduled = false;

function notify() {
  for (const fn of subscribers) fn();
}

async function flush() {
  scheduled = false;

  const ids = Array.from(waiting);
  waiting.clear();

  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from("public_badges")
    .select("profile_id, badge_key, category")
    .in("profile_id", ids);

  // A badge is decoration. If this fails the names still have to render, so
  // every requested id resolves to "holds nothing" rather than retrying for
  // ever behind a spinner nobody sees.
  for (const id of ids) {
    if (!cache.has(id)) cache.set(id, []);
  }

  if (!error && data) {
    for (const row of data as PublicBadge[]) {
      cache.get(row.profile_id)?.push(row);
    }
  }

  notify();
}

function request(profileId: string) {
  if (cache.has(profileId) || waiting.has(profileId)) return;

  waiting.add(profileId);

  if (!scheduled) {
    scheduled = true;
    // Microtask, not a timer: every card in one render pass enqueues before
    // this runs, so a page's worth of ids goes out as one query.
    queueMicrotask(flush);
  }
}

/**
 * Badges held by one profile.
 *
 * `verified` is what the check mark beside a name keys off. It counts only
 * badges in the 'verification' category — see components/ui/VerifiedCheck.tsx
 * for why early_member must not light it up.
 */
export function useProfileBadge(profileId: string | null | undefined) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!profileId) return;

    const onChange = () => forceRender((n) => n + 1);
    subscribers.add(onChange);
    request(profileId);

    return () => {
      subscribers.delete(onChange);
    };
  }, [profileId]);

  const held = profileId ? cache.get(profileId) : undefined;

  return {
    /** Show the check mark. False while still loading, which is the right
     *  default: a mark that appears late is better than one that flickers. */
    verified: (held ?? []).some((b) => b.category === "verification"),
    /** Every currently-valid badge key. For the profile's badges section. */
    badgeKeys: (held ?? []).map((b) => b.badge_key),
    loading: held === undefined,
  };
}

/**
 * Drops everything fetched so far. Call after an action that changes a badge —
 * an admin approval — so the next render refetches instead of showing the
 * pre-approval state for the life of the page.
 */
export function clearProfileBadgeCache() {
  cache.clear();
  notify();
}
