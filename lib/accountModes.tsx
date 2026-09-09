// Account modes — which dashboard an account can show.
//
// Spec: docs/signup-and-brand-spec.md section 2.
//
// This file deliberately understands BOTH vocabularies at once, because it
// ships ahead of 20260909120000_signup_roles_and_account_mode.sql:
//
//   before the migration  profiles.account_type holds 'worker' | 'employer' | null
//   after  the migration  profiles.account_type holds 'company' | 'individual' | 'brand'
//
// Keeping both mappings here means the component change is safe to merge now
// and needs no follow-up edit when the migration lands.

export type AccountMode = "company" | "individual" | "brand";

/** Pre-migration values. Removed once the migration is applied. */
export type LegacyMode = "worker" | "employer";

export type Mode = AccountMode | LegacyMode;

export const LEGACY_MODES: readonly Mode[] = ["worker", "employer"];

export const MODE_LABELS: Record<Mode, string> = {
  worker: "Worker",
  employer: "Employer",
  company: "Company",
  individual: "Individual",
  brand: "Brand",
};

export function modeLabel(mode: string): string {
  return MODE_LABELS[mode as Mode] ?? mode;
}

/**
 * The modes this account is allowed to switch between.
 *
 * Company and individual accounts each have exactly one mode, so the switcher
 * hides itself for them. Brand workspaces on company accounts are still an
 * open decision (spec section 6) — `hasBrandWorkspace` is the seam for it and
 * is always false until that is settled.
 */
export function availableModes(
  accountType: string | null | undefined,
  opts: { hasBrandWorkspace?: boolean } = {}
): Mode[] {
  switch (accountType) {
    case "company":
      return opts.hasBrandWorkspace ? ["company", "brand"] : ["company"];
    case "individual":
      return ["individual"];
    case "brand":
      return ["brand"];
    default:
      // 'worker', 'employer', or null — the migration has not run yet. The
      // dashboard still gates on active_role, so both legacy modes stay
      // available and the switcher renders exactly as it does today.
      return [...LEGACY_MODES];
  }
}
