/**
 * CSLB licence verification — the client-side half.
 *
 * The rule itself lives in the database, in cslb_evaluate_license()
 * (supabase/migrations/20260921120000_cslb_license_verification.sql). This file
 * holds only what the admin panel needs to render what that function decided:
 * a label per reason, and where a reviewer goes to check it by hand.
 *
 * NOTHING HERE DECIDES ANYTHING. If a rule is ever added or changed, it changes
 * in the SQL function and a label is added below — never the other way round.
 * A second copy of the decision table in TypeScript is how the two start
 * disagreeing about who is verified.
 */

/** Where a reviewer checks a licence by hand. */
export const CSLB_LOOKUP_URL =
  "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx";

/**
 * Days after which imported data stops being good enough to verify anyone new
 * against. Mirrors the threshold in cslb_evaluate_license(); the database is
 * the enforcer and this is only what the banner counts against.
 */
export const CSLB_STALE_AFTER_DAYS = 30;

/** The reason codes user_badge_reviews.reason is constrained to. */
export type CslbReason =
  | "no_number"
  | "not_found"
  | "suspended"
  | "pending_suspension"
  | "wrong_classification"
  | "expired"
  | "stale_data"
  | "already_claimed"
  | "name_mismatch";

type ReasonCopy = {
  /** Short label for the chip on the card. */
  label: string;
  /** One sentence telling the reviewer what to do about it. */
  detail: string;
  /**
   * Whether this reason reflects something found ON the licence, as opposed to
   * something about our own data. It drives the colour: an amber chip for
   * "we could not check", red for "we checked and it is not clean".
   */
  onLicence: boolean;
};

const REASONS: Record<CslbReason, ReasonCopy> = {
  no_number: {
    label: "No licence number",
    detail:
      "This account holds a C-10 signup type but entered no licence number. There is nothing to look up.",
    onLicence: false,
  },
  not_found: {
    label: "Not in the CSLB file",
    detail:
      "The number is not in the imported list. The file carries active licences only, so this is a typo, a licence newer than the file, or one that has been revoked — check it by hand before deciding.",
    onLicence: false,
  },
  suspended: {
    label: "Suspended",
    detail:
      "CSLB shows this licence as suspended rather than clear. The status seen is shown below.",
    onLicence: true,
  },
  pending_suspension: {
    label: "Suspension pending",
    detail:
      "The licence is clear, but CSLB has flagged a suspension in progress against it. Not yet suspended.",
    onLicence: true,
  },
  wrong_classification: {
    label: "Not a C-10 licence",
    detail:
      "The number is on the CSLB register, under a classification that is not C-10. Nothing else about it was checked — the classification settles this on its own, so no status or expiry is shown below. Look it up by hand if the account claims C-10 under a different number.",
    onLicence: true,
  },
  expired: {
    label: "Expired",
    detail: "The expiration date on the CSLB record has passed.",
    onLicence: true,
  },
  stale_data: {
    label: "Data too old to check",
    detail:
      "Our imported CSLB file is more than 30 days old, so no automatic verification was attempted. Import the current file and this will re-check itself.",
    onLicence: false,
  },
  already_claimed: {
    label: "Claimed by another account",
    detail:
      "This licence number is already verified on a different account. Only one account may hold a licence — approving this one revokes the other, so establish which account actually belongs to the licence holder before deciding.",
    onLicence: true,
  },
  name_mismatch: {
    label: "Name does not match",
    detail:
      "The licence is current and clear, but the business name on this account does not resemble either name on the CSLB record. Often innocent — a sole owner trading under their own name, a DBA, a spelling — and sometimes someone typing in a number that is not theirs.",
    onLicence: true,
  },
};

export function cslbReasonCopy(reason: string | null | undefined): ReasonCopy {
  if (reason && reason in REASONS) return REASONS[reason as CslbReason];

  // An unrecognised reason is not a render failure. The CHECK constraint makes
  // it nearly impossible, but a value added in SQL before a label is added here
  // should show the raw code rather than a blank chip.
  return {
    label: reason ? reason.replace(/_/g, " ") : "Awaiting review",
    detail:
      "This request is waiting for a decision. No automated reason was recorded.",
    onLicence: false,
  };
}

/**
 * What the CONTRACTOR is told, on their own profile.
 *
 * A SEPARATE SET OF STRINGS FROM cslbReasonCopy(), which is written for a
 * reviewer. These two audiences want different things from the same reason
 * code: the reviewer wants to know what to check, and the contractor wants to
 * know what happened to them and what they can do about it. Every message below
 * ends with the second of those, even when the answer is "nothing".
 *
 * already_claimed NEVER NAMES THE OTHER ACCOUNT, and that is not a nicety. The
 * claim is far more often a typo than a theft, and a message saying whose
 * licence it is would hand one user another user's identity on the strength of
 * a number they typed — which is precisely the attack the check exists to stop,
 * with the answer delivered by us instead. The conflicting account lives in
 * user_badge_reviews, which is admin-only. There is nothing in this file, in
 * user_badges, or in public_badges that could leak it.
 */

/** How the message should read: good news, waiting on us, or over to you. */
export type CslbOwnerTone = "good" | "waiting" | "action";

export type CslbOwnerStatus = { tone: CslbOwnerTone; text: string };

const OWNER_MESSAGES: Record<CslbReason, CslbOwnerStatus> = {
  no_number: {
    tone: "action",
    text: "Add your C-10 licence number below and we'll check it against the CSLB register automatically.",
  },
  not_found: {
    tone: "action",
    text: "We couldn't find this licence number on the CSLB register. Check the digits below — and note the register lists active licences only, so a very new licence may not be listed yet. Either way someone will look at it by hand.",
  },
  name_mismatch: {
    tone: "action",
    text: "Your licence is current and clear, but the business name on your account doesn't match the name CSLB has on record for it. Update it below to match your licence exactly, or leave it and someone will check by hand.",
  },
  already_claimed: {
    tone: "action",
    text: "This licence number is already linked to another account, so we can't verify it here. If the licence is yours, contact us and we'll sort it out.",
  },
  expired: {
    tone: "action",
    text: "CSLB shows this licence as expired. Once you've renewed it with CSLB we'll pick that up at the next check — there's nothing to resubmit here.",
  },
  suspended: {
    tone: "action",
    text: "CSLB shows this licence as suspended, and we can't verify a suspended licence. When CSLB shows it clear again we'll pick that up automatically.",
  },
  pending_suspension: {
    tone: "waiting",
    text: "Your licence is clear, but CSLB has a suspension pending against it, so we've sent this for a manual check rather than approving it automatically.",
  },
  wrong_classification: {
    tone: "action",
    text: "CSLB has this licence number on the register, but not with a C-10 classification on it. If you hold C-10 under a different number, enter that one below — otherwise contact us and someone will take a look.",
  },
  stale_data: {
    tone: "waiting",
    text: "We're waiting on an up-to-date copy of the CSLB register before checking this. Nothing for you to do — it'll run on its own.",
  },
};

/**
 * The line under the License Verified badge on /dashboard/profile.
 *
 * Returns null when there is nothing useful to add — a rejected badge already
 * renders its rejection_reason, which is a human's own words and beats anything
 * generic here.
 */
export function cslbOwnerStatus(badge: {
  status: string;
  expires_at: string | null;
  check_reason: string | null;
  rejection_reason: string | null;
}): CslbOwnerStatus | null {
  if (badge.status === "verified") {
    const expired =
      !!badge.expires_at && new Date(badge.expires_at).getTime() <= Date.now();

    // expires_at is the day AFTER the licence's printed expiry, so the date to
    // show is one day back from it. See cslb_apply_check().
    const printed = badge.expires_at
      ? new Date(new Date(badge.expires_at).getTime() - 86_400_000)
      : null;

    if (expired) {
      return {
        tone: "action",
        text: `Your licence expired on ${printed!.toLocaleDateString()} according to CSLB, so the check mark no longer shows. Renew with CSLB and we'll restore it at the next check.`,
      };
    }

    return {
      tone: "good",
      text: printed
        ? `Verified against the CSLB register. Valid until ${printed.toLocaleDateString()}, the expiry date on your licence.`
        : "Verified against the CSLB register.",
    };
  }

  // A human's own words beat a generic sentence, and BadgesSection already
  // renders rejection_reason underneath.
  if (badge.status === "rejected") return null;

  if (badge.status === "revoked") {
    return {
      tone: "action",
      text: "This verification was removed by an administrator. Contact us if you think that was a mistake.",
    };
  }

  if (badge.check_reason && badge.check_reason in OWNER_MESSAGES) {
    return OWNER_MESSAGES[badge.check_reason as CslbReason];
  }

  return {
    tone: "waiting",
    text: "Waiting for someone to check this by hand. We'll let you know either way.",
  };
}

/**
 * Licence number reduced to digits — mirrors cslb_normalise_license() in SQL.
 *
 * Used only for display, so the number shown to a reviewer is the number that
 * was actually looked up rather than whatever punctuation the user typed
 * around it.
 */
export function normaliseLicenseNumber(value: string | null | undefined) {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  return digits === "" ? null : digits;
}
