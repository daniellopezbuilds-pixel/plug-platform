import { signupTypeLabel, type SignupTypeKey } from "@/lib/signupRoles";

/**
 * Where an account's signup_type actually comes from, and whether it has one.
 *
 * ONE RESOLVER, AND THAT IS THE WHOLE POINT. The dashboard gate
 * (app/dashboard/layout.tsx) sends an un-onboarded account to /signup, and
 * /signup sends an onboarded one to /dashboard. If those two ever disagree
 * about a single account, it bounces between them forever. Both go through
 * here, so disagreeing is not something they can do.
 *
 * WHY TWO SOURCES
 *
 * signup_type lives in two places that do not always agree:
 *
 *   - `raw_user_meta_data.signup_type`, written by the email signup form and
 *     read by hooks/useActiveRole.tsx and app/dashboard/profile/page.tsx.
 *   - `profiles.signup_type`, the real column added by
 *     20260916130000_badges.sql — server-held, and guarded against
 *     self-assignment by profiles_guard_signup_type().
 *
 * Either one counts. Requiring the column would catch legacy rows the badges
 * backfill deliberately left NULL — it did not map account_type='company' to
 * 'c10', because that guess is not sound — and those are working accounts whose
 * owners would suddenly be asked to re-onboard. Requiring the metadata would
 * catch anyone whose row was backfilled server-side instead. A Google account
 * that has authenticated but not onboarded has neither, which is the case the
 * gate exists for.
 */

/**
 * The account's signup type, or null if it does not have a usable one.
 *
 * Metadata is preferred because it is what useActiveRole has always returned,
 * but only when it is RECOGNISED — raw_user_meta_data is client-writable, so
 * `signup_type: "whatever"` is a string any user can set on themselves. An
 * unrecognised metadata value must not shadow a real column value, which is
 * why this cannot be a plain `??` between the two.
 */
export function resolveSignupType(
  metadataSignupType: string | null | undefined,
  columnSignupType: string | null | undefined
): SignupTypeKey | null {
  // signupTypeLabel() returns null for anything outside the four known keys,
  // so a non-null label is proof the value is one of them.
  if (signupTypeLabel(metadataSignupType) !== null) {
    return metadataSignupType as SignupTypeKey;
  }

  if (signupTypeLabel(columnSignupType) !== null) {
    return columnSignupType as SignupTypeKey;
  }

  return null;
}

/**
 * Takes the ALREADY-RESOLVED value, not the two raw sources, so a caller
 * holding a resolved signup_type (which is what useActiveRole hands back)
 * cannot accidentally re-derive it a second, different way.
 */
export function isOnboarded(
  resolvedSignupType: string | null | undefined
): boolean {
  return signupTypeLabel(resolvedSignupType) !== null;
}
