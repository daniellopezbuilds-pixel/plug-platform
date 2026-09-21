"use client";

import { useState } from "react";
import { NameMeta } from "@/components/ui/NameMeta";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useToast } from "@/components/ui/Toast";
import { timeAgo } from "@/lib/relativeTime";
import { CSLB_LOOKUP_URL, cslbReasonCopy } from "@/lib/cslb";
import type { BadgeRequest } from "@/hooks/useBadgeRequests";

/**
 * One licence-verification request awaiting a human.
 *
 * THE CARD'S JOB IS TO MAKE THE HAND-CHECK FAST. Everything the reviewer needs
 * to open the CSLB lookup and compare is on the card: the number as it was
 * actually looked up, what the import saw against it, and how old the file was
 * when it looked. The link is right next to them.
 *
 * AN APPROVAL REQUIRES AN EXPIRY DATE, and there is nowhere to hide from it.
 * badges.requires_expiry is true for license_verified, so user_badges_validate()
 * refuses a verified row with no expires_at — an approval without one fails in
 * the database with a constraint message the reviewer cannot act on. Asking for
 * it here, with the CSLB record open, turns that into a field with a label.
 *
 * A REJECTION REQUIRES A REASON THE USER WILL READ. user_badges.rejection_reason
 * is what gets shown to them, and its CHECK constraint refuses whitespace. The
 * private record of what was actually checked goes in the optional note, which
 * lands in user_badge_reviews.notes and which the user never sees.
 */
export function BadgeRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: BadgeRequest;
  onApprove: (
    id: string,
    input: {
      expiresOn: string;
      licenseNumber: string;
      checkedStatus: string | null;
      notes: string | null;
      profileId: string;
      conflictBadgeId?: string | null;
    }
  ) => Promise<{ error: string | null }>;
  onReject: (
    id: string,
    input: {
      rejectionReason: string;
      licenseNumber: string | null;
      checkedStatus: string | null;
      notes: string | null;
    }
  ) => Promise<{ error: string | null }>;
}) {
  const toast = useToast();
  const reason = cslbReasonCopy(request.reason);

  const [expiresOn, setExpiresOn] = useState(request.checked_expires_on ?? "");
  const [licenseNumber, setLicenseNumber] = useState(request.license_number ?? "");
  const [notes, setNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedTransfer, setConfirmedTransfer] = useState(false);

  // A conflict only blocks an approval while the other account still HOLDS the
  // badge. If it has since been revoked or has expired, badgeId is null, the
  // licence is free, and there is nothing for the reviewer to confirm.
  const transfer = request.conflict?.badgeId ? request.conflict : null;

  async function handleApprove() {
    // The number as VERIFIED, not as submitted -- user_badge_reviews'
    // checked_identifier CHECK insists an approval carries one, and a reviewer
    // who found the licence under a corrected number should record that one.
    if (!licenseNumber.trim()) {
      toast.error("Record the licence number you checked before approving.");
      return;
    }

    if (!expiresOn) {
      toast.error(
        "Add the expiry date from the CSLB record. The badge stops counting on it."
      );
      return;
    }

    // Belt and braces over a database invariant, not a substitute for one. The
    // unique index refuses a second verified badge on one number whatever this
    // component does; the checkbox exists so the reviewer knows the approval
    // takes the badge off someone before they make it, rather than finding out
    // from a constraint error.
    if (transfer && !confirmedTransfer) {
      toast.error(
        "This licence is verified on another account. Confirm the transfer before approving."
      );
      return;
    }

    setSubmitting(true);
    await onApprove(request.id, {
      expiresOn,
      licenseNumber: licenseNumber.trim(),
      checkedStatus: request.checked_status,
      notes: notes.trim() || null,
      profileId: request.profile_id,
      conflictBadgeId: transfer?.badgeId ?? null,
    });
    setSubmitting(false);
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      toast.error("Give a reason. The contractor sees this one.");
      return;
    }

    setSubmitting(true);
    await onReject(request.id, {
      rejectionReason: rejectionReason.trim(),
      licenseNumber: licenseNumber.trim() || null,
      checkedStatus: request.checked_status,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-white font-semibold">
            {request.full_name || "Unnamed"}
            <NameMeta
              profileId={request.profile_id}
              signupType={request.signup_type}
            />
          </h3>
          <p className="text-gray-400 text-sm mt-1">
            {[request.trade, request.location].filter(Boolean).join(" · ") ||
              "No trade or location on the profile"}
          </p>
        </div>

        <span
          className={[
            "shrink-0 px-3 py-1 rounded-full text-xs font-semibold border",
            reason.onLicence
              ? "border-red-900 bg-red-950 text-red-300"
              : "border-amber-900 bg-amber-950 text-amber-300",
          ].join(" ")}
        >
          {reason.label}
        </span>
      </div>

      <p className="text-gray-300 text-sm">{reason.detail}</p>

      {/* What the check actually compared. On a name_mismatch this is the
          single most useful thing on the card -- the CSLB name and the account
          name, side by side, so the reviewer can judge in one glance whether
          it is a DBA or a stranger. */}
      {request.notes && (
        <p className="text-gray-400 text-sm border-l-2 border-zinc-700 pl-3">
          {request.notes}
        </p>
      )}

      {request.conflict && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 p-3">
          <p className="text-red-200 text-sm font-semibold">
            Also claimed by{" "}
            {request.conflict.fullName || "another account"}
          </p>

          <p className="text-red-200/80 text-sm mt-1">
            {transfer ? (
              <>
                That account currently holds the verified badge for this
                licence. Only one account can. Approving here takes it off them
                and gives it to this account — decide which one is the licence
                holder first.
              </>
            ) : (
              <>
                That account no longer holds a verified badge for this licence,
                so the conflict has cleared. Nothing will be revoked.
              </>
            )}
          </p>

          <a
            href={`/dashboard/profile/${request.conflict.profileId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-200 text-sm font-semibold hover:underline inline-block mt-2"
          >
            Open the other account ↗
          </a>
        </div>
      )}

      {/* What the automated check actually saw. Absent fields are omitted
          rather than rendered empty -- "Status: —" tells a reviewer nothing
          that a missing row does not. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-gray-500 text-xs uppercase tracking-wide">
            Licence entered
          </dt>
          <dd className="text-white font-mono">
            {request.license_number || "—"}
          </dd>
        </div>

        {request.checked_status && (
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">
              CSLB status
            </dt>
            <dd className="text-white">{request.checked_status}</dd>
          </div>
        )}

        {request.checked_expires_on && (
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">
              Expires
            </dt>
            <dd className="text-white">{request.checked_expires_on}</dd>
          </div>
        )}

        <div>
          <dt className="text-gray-500 text-xs uppercase tracking-wide">
            Checked against
          </dt>
          <dd className="text-white">
            {request.source_as_of
              ? `File of ${request.source_as_of}`
              : "No import"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <a
          href={CSLB_LOOKUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent font-semibold hover:underline"
        >
          Check on CSLB ↗
        </a>
        <span className="text-gray-500">
          Requested {timeAgo(request.requested_at)}
        </span>
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-gray-400 text-xs uppercase tracking-wide">
              Licence number checked
            </span>
            <input
              type="text"
              value={licenseNumber}
              onChange={(event) => setLicenseNumber(event.target.value)}
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
            />
          </label>

          <label className="block">
            <span className="text-gray-400 text-xs uppercase tracking-wide">
              Expires (from the CSLB record)
            </span>
            <input
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-gray-400 text-xs uppercase tracking-wide">
            Note — what you checked (private)
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="Looked up on CSLB, name and classification match."
            className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </label>

        {rejecting && (
          <label className="block">
            <span className="text-gray-400 text-xs uppercase tracking-wide">
              Reason — the contractor sees this
            </span>
            <textarea
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              rows={2}
              placeholder="We couldn't match this number to a C-10 licence on the CSLB register."
              className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
            />
          </label>
        )}

        {transfer && !rejecting && (
          <label className="flex items-start gap-2 text-sm text-red-200">
            <input
              type="checkbox"
              checked={confirmedTransfer}
              onChange={(event) => setConfirmedTransfer(event.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span>
              Revoke {transfer.fullName || "the other account"}&rsquo;s verified
              badge and move this licence to this account.
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-green-500 transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <ButtonSpinner active={submitting && !rejecting} />
            {transfer ? "Transfer and verify" : "Verify licence"}
          </button>

          {!rejecting ? (
            <button
              onClick={() => setRejecting(true)}
              disabled={submitting}
              className="border border-zinc-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition disabled:opacity-60"
            >
              Reject
            </button>
          ) : (
            <>
              <button
                onClick={handleReject}
                disabled={submitting}
                className="bg-red-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-red-600 transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                <ButtonSpinner active={submitting} />
                Confirm rejection
              </button>
              <button
                onClick={() => {
                  setRejecting(false);
                  setRejectionReason("");
                }}
                disabled={submitting}
                className="border border-zinc-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-zinc-800 transition disabled:opacity-60"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
