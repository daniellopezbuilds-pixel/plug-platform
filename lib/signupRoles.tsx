// Signup types — the single choice made at step 1, and the fields each one
// collects at step 3.
//
// Spec: docs/signup-and-brand-spec.md section 1.
//
// Signup is SINGLE-SELECT. Someone who is both a C-10 and an instructor picks
// the one that describes them best and adds the rest to their profile later.
// The multi-select taxonomy still exists in the schema (roles, account_roles)
// and in ad targeting — this file maps the one signup choice onto it.
//
// KEEP IN SYNC: roleKeyFor() returns keys that must match the roles table seed
// in supabase/migrations/20260909120000_signup_roles_and_account_mode.sql.
// Note c10 -> 'contractor'; the signup key and the role key are deliberately
// different words for the same thing.

export type SignupTypeKey = "c10" | "electrician" | "instructor" | "brand";

export type SignupField = {
  /** Becomes a key in the signup_fields object in raw_user_meta_data. */
  key: string;
  label: string;
  type?: "text" | "textarea";
  /** Textarea height. Ignored for text fields. */
  rows?: number;
};

export type SignupType = {
  key: SignupTypeKey;
  label: string;
  description: string;
  fields: readonly SignupField[];
};

// Each type has its own notes field — the label and height differ per type,
// so there is no shared constant.
export const SIGNUP_TYPES: readonly SignupType[] = [
  {
    key: "c10",
    label: "C-10 Contractor",
    description: "Licensed to contract — runs jobs and hires",
    fields: [
      { key: "license_number", label: "License number" },
      { key: "certification_name", label: "Name of certification" },
      { key: "notes", label: "Additional information", type: "textarea", rows: 2 },
    ],
  },
  {
    key: "electrician",
    label: "Electrician",
    description: "Works on the tools, employed or independent",
    fields: [
      { key: "company", label: "Company" },
      { key: "notes", label: "Other information", type: "textarea", rows: 3 },
    ],
  },
  {
    key: "instructor",
    label: "Electrical Instructor",
    description: "Teaches or trains in the trade",
    fields: [
      { key: "certificate", label: "Certificate" },
      { key: "notes", label: "Additional information", type: "textarea", rows: 3 },
    ],
  },
  {
    key: "brand",
    label: "Brand",
    description: "Advertises to the trade — does no electrical work",
    fields: [
      { key: "brand_name", label: "Brand name" },
      { key: "website", label: "Website" },
      { key: "category", label: "Category" },
      { key: "notes", label: "Anything else", type: "textarea", rows: 2 },
    ],
  },
];

export function signupType(key: SignupTypeKey): SignupType {
  // Non-null: SIGNUP_TYPES covers every SignupTypeKey.
  return SIGNUP_TYPES.find((t) => t.key === key)!;
}

/**
 * Display label for a signup_type read out of user_metadata.
 *
 * Takes a loose string and returns null for anything unrecognised, because
 * user_metadata is client-writable — a user can set signup_type to any value
 * they like, and that must not be able to break a render.
 */
export function signupTypeLabel(key: string | null | undefined): string | null {
  return SIGNUP_TYPES.find((t) => t.key === key)?.label ?? null;
}

/**
 * The existing profiles.role vocabulary, which the signup trigger still reads
 * out of raw_user_meta_data. Until the account_type/active_mode collapse is
 * applied, every new signup must still carry one of these two values.
 *
 * brand maps to 'employer' purely so the existing trigger creates the profile
 * row with no trigger change. It is not a claim that a brand is an employer —
 * brand-specific UI keys off signup_type, never off role.
 */
export function legacyRoleFor(key: SignupTypeKey): "employer" | "worker" {
  return key === "c10" || key === "brand" ? "employer" : "worker";
}

/** Target vocabulary for the collapse. Read by the pending backfill. */
export function accountTypeFor(
  key: SignupTypeKey
): "company" | "individual" | "brand" {
  if (key === "brand") return "brand";
  return key === "c10" ? "company" : "individual";
}

/**
 * roles.key values this signup implies. c10 is called contractor there.
 * Brands hold no trade role, so the list is empty — matching the spec's
 * "account_roles is empty for brand accounts".
 */
export function roleKeysFor(
  key: SignupTypeKey
): ("contractor" | "electrician" | "instructor")[] {
  if (key === "brand") return [];
  return [key === "c10" ? "contractor" : key];
}
