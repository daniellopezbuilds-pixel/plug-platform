"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { clearProfileBadgeCache } from "@/hooks/useProfileBadges";

/**
 * The licence-verification review queue.
 *
 * WHAT LANDS HERE. Everything the automated CSLB check declined to verify —
 * see cslb_evaluate_license() in
 * supabase/migrations/20260921120000_cslb_license_verification.sql. The check
 * never rejects: a licence it cannot confirm becomes a pending badge and a
 * user_badge_reviews row recording what it saw and why it stopped. That review
 * row is where the reason on each card comes from.
 *
 * THE LICENCE NUMBER COMES FROM user_badges.submitted_fields, not from
 * role_credentials. The trigger writes it there in its normalised form
 * (digits only, the value actually looked up), and user_badges is readable by
 * its owner and by admins — the same audience the credential row has, without
 * this hook needing to reach into a second table.
 *
 * WRITES GO THROUGH RLS, not through a route. "admins update badges" and
 * "admins file badge reviews" already gate both tables on public.is_admin(),
 * and the second pins reviewer_id to the caller so a decision cannot be filed
 * under someone else's name. That is the same shape as useEmployerVerifications
 * and useUnionVerifications. The AUTOMATIC path is the one that must never come
 * from a browser, and it does not — it runs inside Postgres.
 */

export type BadgeRequest = {
  id: string;
  profile_id: string;
  requested_at: string;
  license_number: string | null;

  full_name: string | null;
  signup_type: string | null;
  trade: string | null;
  location: string | null;

  /** From the most recent user_badge_reviews row, if the check has run. */
  reason: string | null;
  checked_status: string | null;
  checked_expires_on: string | null;
  /**
   * The classifications on the CSLB record, normalised: ["A", "B", "C36"].
   * Null where no record was read, and on rows written before the column
   * existed — the card omits the field rather than rendering an empty list.
   */
  checked_classifications: string[] | null;
  source_as_of: string | null;
  checked_at: string | null;
  /** What the check saw on the CSLB record, and the name on this account. */
  notes: string | null;
  /** Set only on already_claimed. */
  conflict: BadgeConflict | null;
};

/**
 * The two query shapes, written out rather than inferred.
 *
 * There are no generated Supabase types in this project, so `.select()` with an
 * embed comes back untyped and every sibling hook casts it to `any` at the map.
 * Naming the shape instead costs four lines and makes a column removed from the
 * select a type error here rather than an undefined at render.
 */
type BadgeRow = {
  id: string;
  profile_id: string;
  requested_at: string;
  submitted_fields: { license_number?: string } | null;
  profiles: {
    full_name: string | null;
    signup_type: string | null;
    trade: string | null;
    location: string | null;
  } | null;
};

type ReviewRow = {
  user_badge_id: string;
  reason: string | null;
  checked_status: string | null;
  checked_expires_on: string | null;
  checked_classifications: string[] | null;
  source_as_of: string | null;
  conflicting_profile_id: string | null;
  notes: string | null;
  reviewed_at: string;
};

type ConflictRow = {
  id: string;
  profile_id: string;
  profiles: { full_name: string | null } | null;
};

/**
 * The account already holding a verified badge for this licence number.
 *
 * badgeId is what the approve action revokes. It is fetched rather than derived
 * from the profile id because the other badge may have been revoked or expired
 * between the check running and a reviewer opening the queue — in which case
 * there is nothing to revoke and the conflict has resolved itself.
 */
export type BadgeConflict = {
  profileId: string;
  fullName: string | null;
  /** Null when that account no longer holds a verified badge for this licence. */
  badgeId: string | null;
};

export type CslbImportInfo = {
  /** Days since the newest imported file was generated. Null: never imported. */
  ageDays: number | null;
  sourceAsOf: string | null;
  rowCount: number | null;
};

export function useBadgeRequests() {
  const toast = useToast();
  const [pending, setPending] = useState<BadgeRequest[]>([]);
  const [importInfo, setImportInfo] = useState<CslbImportInfo>({
    ageDays: null,
    sourceAsOf: null,
    rowCount: null,
  });
  const [loading, setLoading] = useState(true);
  /** Set when the queue could not be read at all — see the load() comment. */
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [badgeResult, ageResult, importResult] = await Promise.all([
      supabase
        .from("user_badges")
        .select(
          // NAMED CONSTRAINT, not a bare "profiles". user_badges has TWO
          // foreign keys to profiles -- profile_id and reviewed_by -- so
          // PostgREST refuses a bare embed with PGRST201 and returns no rows.
          // That failed silently for a while: the panel showed "No licences
          // awaiting review" with four queued. Hence the error surfacing below.
          "id, profile_id, requested_at, submitted_fields, profiles!user_badges_profile_id_fkey!inner(id, full_name, signup_type, trade, location)"
        )
        .eq("badge_key", "license_verified")
        .eq("status", "pending")
        .order("requested_at", { ascending: true }),
      supabase.rpc("cslb_data_age_days"),
      supabase
        .from("cslb_imports")
        .select("source_as_of, row_count")
        .order("imported_at", { ascending: false })
        .limit(1),
    ]);

    // The staleness banner is independent of the queue. An import that has
    // never run is exactly when the queue is most likely to be empty and the
    // warning most worth showing, so this is set whatever the badge query did.
    const latestImport = importResult.data?.[0];
    setImportInfo({
      ageDays: typeof ageResult.data === "number" ? ageResult.data : null,
      sourceAsOf: latestImport?.source_as_of ?? null,
      rowCount: latestImport?.row_count ?? null,
    });

    if (badgeResult.error || !badgeResult.data) {
      // SAYS SO, rather than rendering an empty queue. A failed read and an
      // empty queue look identical to a reviewer, and "No licences awaiting
      // review" is a sentence they will believe -- which is exactly how the
      // PGRST201 embed error above went unnoticed.
      console.error(
        "Badge requests: could not load the queue",
        JSON.stringify({ error: badgeResult.error?.message })
      );
      setError(
        badgeResult.error?.message ?? "Could not load the review queue."
      );
      setPending([]);
      setLoading(false);
      return;
    }

    setError(null);

    // Through `unknown`: PostgREST types a to-one embed as an array, the
    // client returns an object, and the two do not overlap enough for a direct
    // cast.
    const rows = badgeResult.data as unknown as BadgeRow[];

    // The reason for each request lives on its newest review row. PostgREST has
    // no "latest per group", so every review for the badges on screen is
    // fetched in one query and reduced here. The queue is small and each badge
    // has a handful of reviews at most.
    const ids = rows.map((row) => row.id);
    const latest = new Map<string, ReviewRow>();

    if (ids.length > 0) {
      const { data: reviews } = await supabase
        .from("user_badge_reviews")
        .select(
          "user_badge_id, reason, checked_status, checked_expires_on, checked_classifications, source_as_of, conflicting_profile_id, notes, reviewed_at"
        )
        .in("user_badge_id", ids)
        .order("reviewed_at", { ascending: false });

      for (const review of (reviews ?? []) as unknown as ReviewRow[]) {
        if (!latest.has(review.user_badge_id)) {
          latest.set(review.user_badge_id, review);
        }
      }
    }

    // The other side of an already_claimed conflict. Resolved through
    // user_badges rather than profiles so the reviewer gets the badge id to
    // revoke and the name in one query -- and so a conflict that has since
    // resolved (the other badge revoked, or expired) comes back with no badge
    // id rather than a stale claim the reviewer cannot act on.
    const conflictProfileIds = Array.from(
      new Set(
        Array.from(latest.values())
          .map((review) => review.conflicting_profile_id)
          .filter((id): id is string => !!id)
      )
    );

    const conflicts = new Map<string, BadgeConflict>();

    if (conflictProfileIds.length > 0) {
      const { data: holders } = await supabase
        .from("user_badges")
        // Named for the same reason as the query above.
        .select("id, profile_id, profiles!user_badges_profile_id_fkey!inner(full_name)")
        .eq("badge_key", "license_verified")
        .eq("status", "verified")
        .in("profile_id", conflictProfileIds);

      for (const holder of (holders ?? []) as unknown as ConflictRow[]) {
        conflicts.set(holder.profile_id, {
          profileId: holder.profile_id,
          fullName: holder.profiles?.full_name ?? null,
          badgeId: holder.id,
        });
      }

      // An id the query did not return is an account that no longer holds the
      // badge. Still shown, so the card can say the conflict has cleared rather
      // than silently dropping the reason the request is here.
      for (const id of conflictProfileIds) {
        if (!conflicts.has(id)) {
          conflicts.set(id, { profileId: id, fullName: null, badgeId: null });
        }
      }
    }

    setPending(
      rows.map((row) => {
        const review = latest.get(row.id);

        return {
          id: row.id,
          profile_id: row.profile_id,
          requested_at: row.requested_at,
          license_number: row.submitted_fields?.license_number || null,

          full_name: row.profiles?.full_name ?? null,
          signup_type: row.profiles?.signup_type ?? null,
          trade: row.profiles?.trade ?? null,
          location: row.profiles?.location ?? null,

          reason: review?.reason ?? null,
          checked_status: review?.checked_status ?? null,
          checked_expires_on: review?.checked_expires_on ?? null,
          // Normalised to null when empty, so the card has one thing to test
          // rather than two. An empty array reaches here from the one CSLB row
          // whose Classifications(s) field is blank.
          checked_classifications: review?.checked_classifications?.length
            ? review.checked_classifications
            : null,
          source_as_of: review?.source_as_of ?? null,
          checked_at: review?.reviewed_at ?? null,
          notes: review?.notes ?? null,
          conflict: review?.conflicting_profile_id
            ? conflicts.get(review.conflicting_profile_id) ?? null
            : null,
        };
      })
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * THE AUDIT ROW IS WRITTEN FIRST, and that order is deliberate.
   *
   * These are two statements from a browser, so there is no transaction around
   * them. One of the two has to be able to fail after the other succeeded, and
   * the two failures are not equally bad:
   *
   *   review first  -> worst case, an audit row for a decision that did not
   *                    take. The request stays in the queue, the reviewer sees
   *                    it, and retrying writes a second row. Recoverable, and
   *                    the history is honest about having been attempted twice.
   *   badge first   -> worst case, a verified badge with no record of who
   *                    verified it or what they checked. That is precisely the
   *                    state profiles.employer_verified is already in, and the
   *                    reason user_badge_reviews exists at all.
   */
  async function fileDecision(
    badgeId: string,
    review: {
      decision: "approved" | "rejected";
      checkedIdentifier: string | null;
      checkedStatus: string | null;
      checkedExpiresOn: string | null;
      notes: string | null;
    }
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { error: "Not signed in." };

    const { error } = await supabase.from("user_badge_reviews").insert({
      user_badge_id: badgeId,
      // Pinned to the caller by the RLS policy as well. Sent explicitly because
      // the policy checks it rather than defaulting it.
      reviewer_id: user.id,
      decision: review.decision,
      source: "manual",
      checked_identifier: review.checkedIdentifier,
      checked_status: review.checkedStatus,
      checked_expires_on: review.checkedExpiresOn,
      // For a manual lookup the record consulted is today's, by definition —
      // the reviewer just looked at the live CSLB site, not at our import.
      source_as_of: new Date().toISOString().slice(0, 10),
      reason: null,
      notes: review.notes,
    });

    return { error: error?.message ?? null, userId: user.id };
  }

  /**
   * Take the licence off the account currently holding it.
   *
   * ONE LICENCE, ONE VERIFIED BADGE — and that is a unique index, not a rule
   * this function is trusted to follow. Verifying a second claim while the
   * first is still verified raises a unique violation, so the revocation is
   * not optional and cannot be skipped by a caller who forgets.
   *
   * IT RUNS FIRST, and the failure mode is the reason. If the revoke succeeds
   * and the verify then fails, the licence ends up verified on NOBODY — the
   * safe direction — and the request is still pending in the queue with the
   * conflict now cleared, so pressing the button again completes it. The other
   * order would leave the index refusing the verify anyway.
   *
   * The revoked badge keeps its awarded_at. user_badges_awarded_at_ck only
   * requires the date on 'verified', and section 4 of 20260916130000 is
   * explicit that a revoked badge keeps the one it had — it was genuinely
   * awarded, and then taken away.
   */
  async function revokeConflicting(
    conflictBadgeId: string,
    reviewerId: string,
    input: { licenseNumber: string; inFavourOf: string; notes: string | null }
  ) {
    const { error: reviewError } = await supabase
      .from("user_badge_reviews")
      .insert({
        user_badge_id: conflictBadgeId,
        reviewer_id: reviewerId,
        decision: "revoked",
        source: "manual",
        checked_identifier: input.licenseNumber,
        source_as_of: new Date().toISOString().slice(0, 10),
        reason: null,
        conflicting_profile_id: input.inFavourOf,
        notes:
          `Revoked so licence ${input.licenseNumber} could be verified on ` +
          `another account.` + (input.notes ? ` ${input.notes}` : ""),
      });

    if (reviewError) return { error: reviewError.message };

    const { error } = await supabase
      .from("user_badges")
      .update({
        status: "revoked",
        expires_at: null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", conflictBadgeId);

    return { error: error?.message ?? null };
  }

  async function approve(
    badgeId: string,
    input: {
      /** YYYY-MM-DD, from the CSLB record. Required — see below. */
      expiresOn: string;
      licenseNumber: string;
      checkedStatus: string | null;
      notes: string | null;
      /** The profile this badge belongs to, for the revocation's audit row. */
      profileId: string;
      /** Set on an already_claimed approval: the badge to take the licence off. */
      conflictBadgeId?: string | null;
    }
  ) {
    if (input.conflictBadgeId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { error: "Not signed in." };

      const revoked = await revokeConflicting(input.conflictBadgeId, user.id, {
        licenseNumber: input.licenseNumber,
        inFavourOf: input.profileId,
        notes: input.notes,
      });

      if (revoked.error) {
        toast.error(revoked.error);
        return { error: revoked.error };
      }

      clearProfileBadgeCache();
    }

    const filed = await fileDecision(badgeId, {
      decision: "approved",
      checkedIdentifier: input.licenseNumber,
      checkedStatus: input.checkedStatus,
      checkedExpiresOn: input.expiresOn,
      notes: input.notes,
    });

    if (filed.error) {
      toast.error(filed.error);
      return { error: filed.error };
    }

    // The day AFTER the printed date, matching cslb_apply_check(). A licence is
    // valid through its expiration date and public_badges tests
    // `expires_at > now()`, so midnight on the date itself would drop the check
    // mark a day early.
    const expiresAt = new Date(`${input.expiresOn}T00:00:00Z`);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);

    const { error } = await supabase
      .from("user_badges")
      .update({
        status: "verified",
        awarded_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        rejection_reason: null,
        reviewed_by: filed.userId,
        reviewed_at: new Date().toISOString(),
        // Cleared by every human decision. check_reason means "why the
        // automated check stopped short", and once a person has looked, it has
        // been superseded -- leaving it set would keep telling the contractor
        // their licence was not found while their badge sits verified.
        check_reason: null,
        // The number as CHECKED, overwriting what was submitted. This is what
        // the one-licence-one-badge unique index is built over, so a reviewer
        // correcting a typo here has to move the value the index guards --
        // otherwise the badge would be verified for one number and reserve a
        // different one.
        submitted_fields: { license_number: input.licenseNumber },
      })
      .eq("id", badgeId);

    if (error) {
      toast.error(error.message);
      return { error: error.message };
    }

    setPending((prev) => prev.filter((request) => request.id !== badgeId));
    // The check mark beside this person's name is cached for the life of the
    // page. Without this it would not appear until a reload.
    clearProfileBadgeCache();
    toast.success("Licence verified.");
    return { error: null };
  }

  async function reject(
    badgeId: string,
    input: {
      /** Shown to the user. Mandatory, and the table's CHECK enforces it too. */
      rejectionReason: string;
      licenseNumber: string | null;
      checkedStatus: string | null;
      notes: string | null;
    }
  ) {
    const filed = await fileDecision(badgeId, {
      decision: "rejected",
      checkedIdentifier: input.licenseNumber,
      checkedStatus: input.checkedStatus,
      checkedExpiresOn: null,
      notes: input.notes,
    });

    if (filed.error) {
      toast.error(filed.error);
      return { error: filed.error };
    }

    const { error } = await supabase
      .from("user_badges")
      .update({
        status: "rejected",
        rejection_reason: input.rejectionReason,
        // See the note on the approve path. The contractor now reads
        // rejection_reason instead, which is a person's own words.
        check_reason: null,
        awarded_at: null,
        expires_at: null,
        reviewed_by: filed.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", badgeId);

    if (error) {
      toast.error(error.message);
      return { error: error.message };
    }

    setPending((prev) => prev.filter((request) => request.id !== badgeId));
    clearProfileBadgeCache();
    toast.success("Request rejected.");
    return { error: null };
  }

  return { pending, importInfo, loading, error, approve, reject, reload: load };
}
