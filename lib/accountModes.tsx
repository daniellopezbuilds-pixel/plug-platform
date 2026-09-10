// Account modes — which dashboard an account is currently showing.
//
// Spec: docs/signup-and-brand-spec.md section 2.
//
// TWO SEPARATE QUESTIONS, DELIBERATELY NOT COLLAPSED
//
//   account_type  what the account signed up as.  company | individual | brand
//   mode          which dashboard is showing.     worker  | employer   | brand
//
// account_type decides which mode you LAND IN, and it is what type-specific
// features will gate on later. It does NOT restrict which dashboard you can
// view. Every non-brand account can switch between Worker and Employer freely,
// whatever it signed up as.
//
// That is a product decision, not an oversight. The trade does not split
// cleanly into people who hire and people who work: a C-10 contractor between
// jobs looks for work, and an electrician with more work than they can take
// hires someone. An account type that locked the dashboard would make the
// switcher a lie for a large part of the user base. Feature gating happens on
// roles (account_roles), never on mode.
//
// Brand is the one exception. A brand does no electrical work, so Worker and
// Employer are meaningless for it — it gets one mode and no switcher.

/** What the account signed up as. Mirrors profiles.account_type. */
export type AccountType = "company" | "individual" | "brand";

/** Which dashboard is showing. Mirrors profiles.active_role / active_mode. */
export type Mode = "worker" | "employer" | "brand";

/** The two modes every non-brand account can switch between. */
export const SWITCHABLE_MODES: readonly Mode[] = ["worker", "employer"];

export const MODE_LABELS: Record<Mode, string> = {
  worker: "Worker",
  employer: "Employer",
  brand: "Brand",
};

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode as Mode] ?? mode;
}

/**
 * The modes this account is allowed to switch between.
 *
 * Non-brand accounts get both, regardless of account_type — see the note at
 * the top of this file. Callers render no switcher below two modes, so brand
 * accounts get none.
 *
 * Written to be correct both before and after
 * 20260909120000_signup_roles_and_account_mode.sql. Before it, account_type
 * holds the string 'both' on every row (the column default, never
 * overwritten); after it, 'company' | 'individual' | 'brand'. Only 'brand' is
 * matched, and it means the same thing in both vocabularies, so the migration
 * cannot change what this returns for anyone.
 *
 * Brand workspaces on company accounts are still an open decision (spec
 * section 6) — `hasBrandWorkspace` is the seam for it and is always false
 * until that is settled.
 */
export function availableModes(
  accountType: string | null | undefined,
  opts: { hasBrandWorkspace?: boolean } = {}
): Mode[] {
  if (accountType === "brand") return ["brand"];

  return opts.hasBrandWorkspace
    ? [...SWITCHABLE_MODES, "brand"]
    : [...SWITCHABLE_MODES];
}
