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
  /** From the badges catalog, carried by the view since 20260922150000. */
  icon: string | null;
  label: string | null;
};

/**
 * Which verification badge the single marker beside a name should represent,
 * most specific first.
 *
 * ONE MARKER, SO SOMETHING HAS TO WIN. An account can hold more than one
 * verification badge, and the rule is that a name never grows a row of icons —
 * see components/ui/VerifiedCheck.tsx. A licence is the strongest claim on the
 * platform and the one people are looking for, so it takes the marker when it
 * is held.
 *
 * A badge not listed here still lights the marker; it just does not get to
 * choose the glyph unless it is the only one. So a verification badge added by
 * a migration works on the day it ships, without this array being touched — it
 * simply sorts last until somebody decides where it belongs.
 */
const MARKER_PRIORITY = ["license_verified", "business_verified"];

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
    .select("profile_id, badge_key, category, icon, label")
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
 * What the single marker beside a name should say it verified.
 *
 * A PHRASE PER BADGE, not the badge's catalog label. The label is a name for a
 * row on the badges screen ("License Verified"); the marker's title is read on
 * hover with no other context, so it has to be a statement. An unmapped badge
 * falls back to its own label, which is always better than "Verified" and
 * never wrong.
 *
 * WHY THIS IS NOT THE STRING "C-10 licence verified" HARDCODED IN THE ICON.
 * business_verified is a verification badge too; it is switched off today and
 * will not be for ever. A marker that says "C-10 licence verified" for whatever
 * happens to have lit it up would start lying the day that badge is activated,
 * on the accounts least able to notice.
 */
const MARKER_TITLES: Record<string, string> = {
  license_verified: "C-10 licence verified",
  business_verified: "Business verified",
};

function markerTitle(badge: PublicBadge): string {
  return MARKER_TITLES[badge.badge_key] ?? badge.label ?? "Verified";
}

/**
 * Badges held by one profile.
 *
 * `marker` is what the icon beside a name renders from. It is the single
 * highest-priority badge in the 'verification' category, or null — see
 * components/ui/VerifiedCheck.tsx for why early_member must not light it up,
 * and MARKER_PRIORITY above for how one is chosen when there are several.
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

  const verifications = (held ?? []).filter(
    (b) => b.category === "verification"
  );

  // Lowest priority index wins; anything unlisted sorts after everything
  // listed, and ties break on badge_key so the choice is stable across
  // renders rather than depending on row order from the server.
  const marker =
    verifications.length === 0
      ? null
      : [...verifications].sort((a, b) => {
          const ai = MARKER_PRIORITY.indexOf(a.badge_key);
          const bi = MARKER_PRIORITY.indexOf(b.badge_key);
          const ar = ai === -1 ? MARKER_PRIORITY.length : ai;
          const br = bi === -1 ? MARKER_PRIORITY.length : bi;

          return ar - br || a.badge_key.localeCompare(b.badge_key);
        })[0];

  return {
    /** Show the marker. False while still loading, which is the right
     *  default: a mark that appears late is better than one that flickers. */
    verified: marker !== null,
    /** The glyph name from the badges catalog, for BadgeIcon. */
    markerIcon: marker?.icon ?? null,
    /** What the marker verified, as a sentence for its tooltip. */
    markerTitle: marker ? markerTitle(marker) : null,
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
