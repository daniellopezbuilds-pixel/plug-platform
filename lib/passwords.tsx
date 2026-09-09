/**
 * Password rules, in one place.
 *
 * Signup, reset-password and change-password all import from here so the rule
 * cannot drift between them — a minimum enforced at signup but not at reset is
 * not a minimum.
 *
 * These are client-side checks. Supabase enforces its own minimum server-side
 * (project auth settings), and that is the real boundary; this exists so the
 * user is told the rule up front rather than after a failed round trip. If the
 * project's server-side minimum is ever raised above MIN_PASSWORD_LENGTH,
 * raise it here too or the form will promise something the server rejects.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Shown before the user types, never only after a failure. */
export const PASSWORD_RULE = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/**
 * Returns an error string, or null when the pair is acceptable.
 *
 * Checks length before match, so someone who typed a short password twice is
 * told the actual problem rather than being sent to fix a mismatch that isn't
 * there.
 */
export function validatePassword(password: string, confirm: string): string | null {
  if (!password) return "Please enter a password.";

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password !== confirm) return "Passwords do not match.";

  return null;
}
