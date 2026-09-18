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
  type?: "text" | "textarea" | "select";
  /** Textarea height. Ignored for other types. */
  rows?: number;
  /** Required for "select". The stored value is the option string itself. */
  options?: readonly string[];
  /**
   * Blocks submit when empty. Checked in three places — the signup form, the
   * profile editor and app/api/onboarding/complete/route.tsx — all through
   * missingRequiredFields() below, so a Google account cannot skip what an
   * email account is held to.
   */
  required?: boolean;
  /**
   * What to say when a required field is empty.
   *
   * NOT "This field is required". The user can see the field is empty; what
   * they usually do not know is WHICH number we mean or WHERE to find it. Every
   * message here names the thing and, where there is one, the document it is
   * printed on. Optional fields need none — they are never the reason a submit
   * fails.
   */
  requiredError?: string;
  /** Always-visible hint under the input, for context a label cannot carry. */
  hint?: string;
  /**
   * Stored in this profiles column instead of in signup_fields.
   *
   * WHY ANY FIELD WOULD BE. signup_fields is private to the account — it lives
   * in raw_user_meta_data and role_credentials, neither of which one user can
   * read for another. A fact that has to appear on somebody ELSE'S screen
   * cannot live there. Years of experience is printed on the marketplace card
   * and the applicant card, so it has to be a column.
   *
   * Storing it in both places was the alternative and it is worse: two writers
   * for one fact, and editing it through the credentials form would trip the
   * role_credentials trigger that clears `verified` — losing someone's licence
   * verification because they aged a year.
   *
   * So the field is asked at signup like any other, and split off at the point
   * of storage by splitSignupValues(). The profile editor renders it in the
   * main form (bound to the column) and skips it in the credentials section.
   */
  profileColumn?: "years_experience";
};

export type SignupType = {
  key: SignupTypeKey;
  label: string;
  description: string;
  fields: readonly SignupField[];
};

/**
 * Bands, not a number, and deliberately so.
 *
 * "How many years" invites a precision nobody has — people round, and the
 * answer goes stale the day after it is given. A band is the honest resolution,
 * and it is what a hiring filter would bucket into anyway.
 *
 * NOTE THE OVERLAP with profiles.years_experience, an integer column rendered
 * as "{n} years experience" on the marketplace card, the applicant card and
 * both profile views. These are two shapes of one fact and only one should
 * survive; resolving that means either a text column for the band or converting
 * those four surfaces, which is a migration either way. Until it is decided the
 * band lives in signup_fields and the integer column is left exactly as it is.
 */
export const EXPERIENCE_BANDS = [
  "0-2 years",
  "3-5 years",
  "6-10 years",
  "10+ years",
] as const;

/**
 * Electrician classifications, in the vocabulary California uses.
 *
 * Related to lib/trades.tsx but not the same question: `trade` is what kind of
 * work someone does, this is what they are certified to do it as. Kept separate
 * rather than merged, because the marketplace filters on the first and a
 * licence check would read the second.
 */
export const ELECTRICIAN_CLASSIFICATIONS = [
  "Apprentice",
  "Trainee",
  "Journeyman",
  "General Electrician",
  "Residential",
  "Fire/Life Safety",
  "Voice-Data-Video",
] as const;

/**
 * What a brand sells.
 *
 * A fixed list rather than free text because these become ad targeting
 * segments, and a segment spelled four ways is four segments. "Other" is in the
 * list on purpose — a brand we have no bucket for should land somewhere visible
 * rather than be pushed into the nearest wrong one.
 */
export const BRAND_CATEGORIES = [
  "Electrical supply / distributor",
  "Tools and equipment",
  "Manufacturer",
  "Training and education",
  "Software and services",
  "Safety and workwear",
  "Staffing and recruitment",
  "Insurance and finance",
  "Other",
] as const;

/**
 * The years-of-experience band, which every trade type asks and brand does not.
 *
 * ONE DEFINITION, THREE USES. Only the error message differs between them —
 * what counts as experience is not quite the same sentence for someone who
 * holds a licence, someone on the tools and someone who teaches. Everything
 * that must not differ (the key, the band list, the fact that it is stored in a
 * profiles column rather than in signup_fields) is fixed here, so adding a
 * fourth trade type cannot accidentally store it somewhere else.
 *
 * Brand has no equivalent and should not get one: a distributor's years in
 * business is not the same claim, and nothing renders it.
 */
function experienceField(requiredError: string): SignupField {
  return {
    key: "years_experience",
    label: "Years of experience",
    type: "select",
    options: EXPERIENCE_BANDS,
    required: true,
    // profiles.years_experience, not signup_fields — it is printed on other
    // people's screens. See profileColumn on SignupField.
    profileColumn: "years_experience",
    requiredError,
  };
}

// Each type has its own notes field — the label and height differ per type,
// so there is no shared constant.
export const SIGNUP_TYPES: readonly SignupType[] = [
  {
    key: "c10",
    label: "C-10 Contractor",
    description: "Licensed to contract — runs jobs and hires",
    fields: [
      {
        key: "business_name",
        label: "Business name",
        required: true,
        requiredError:
          "The business name on your licence — the one CSLB has on record, not a trading name.",
      },
      {
        key: "license_number",
        label: "License number",
        required: true,
        requiredError: "Your C-10 licence number — it's on your CSLB record.",
      },
      // After the licence, not before it: the licence is what identifies a
      // contractor, and the first field of a form should be the one they came
      // to give.
      experienceField(
        "Roughly how long you've worked in the trade — pick the closest range, including the years before you were licensed."
      ),
      { key: "certification_name", label: "Name of certification" },
      { key: "notes", label: "Additional information", type: "textarea", rows: 2 },
    ],
  },
  {
    key: "electrician",
    label: "Electrician",
    description: "Works on the tools, employed or independent",
    fields: [
      experienceField(
        "Roughly how long you've worked in the trade — pick the closest range, apprenticeship included."
      ),
      {
        key: "classification",
        label: "Classification",
        type: "select",
        options: ELECTRICIAN_CLASSIFICATIONS,
        required: true,
        requiredError:
          "How you're classified on the job. Pick the closest one if none match exactly.",
      },
      { key: "certification", label: "Certification" },
      { key: "notes", label: "Other information", type: "textarea", rows: 3 },
    ],
  },
  {
    key: "instructor",
    label: "Electrical Instructor",
    description: "Teaches or trains in the trade",
    fields: [
      {
        key: "certification_or_approval",
        label: "Certification or approval",
        required: true,
        requiredError:
          "What lets you teach — a state CE provider approval number, a training certification, or the body that approved you.",
      },
      experienceField(
        "Roughly how long you've worked in the trade — time on the tools and time teaching both count."
      ),
      { key: "school_or_program", label: "Affiliated school or program" },
      { key: "notes", label: "Additional information", type: "textarea", rows: 3 },
    ],
  },
  {
    key: "brand",
    label: "Brand",
    description: "Advertises to the trade — does no electrical work",
    fields: [
      {
        key: "brand_name",
        label: "Brand name",
        required: true,
        requiredError:
          "The name the trade will see on your ads and on your profile.",
      },
      {
        key: "website",
        label: "Website",
        required: true,
        hint: "Where your ads will send people.",
        requiredError:
          "The site your ads should link to — include the https:// so the link works.",
      },
      {
        key: "category",
        label: "Category",
        type: "select",
        options: BRAND_CATEGORIES,
        required: true,
        requiredError:
          "What you sell to the trade. This is how we match you to an audience.",
      },
      { key: "notes", label: "Anything else", type: "textarea", rows: 2 },
    ],
  },
];

/**
 * Keys that were collected under a different name, mapped to the current one.
 *
 * The field sets are not frozen — `certificate` was the instructor's only
 * credential before the set grew — and the profile editor rebuilds
 * signup_fields from the CURRENT definition on every save. Without this, an
 * instructor who saved anything would silently drop the certificate they
 * entered at signup, because the form never rendered a key it no longer knows.
 *
 * Add an entry here when renaming a key. A key dropped outright rather than
 * renamed has nowhere to go and its value does go with it — a decision to make
 * on purpose, not one to discover afterwards. The electrician's old `company`
 * field is exactly that case: there is no field it belongs in now.
 */
export const LEGACY_FIELD_ALIASES: Record<string, string> = {
  // instructor: a single "Certificate" text field -> "Certification or approval"
  certificate: "certification_or_approval",
};

/**
 * Stored signup_fields with renamed keys moved to their current names.
 *
 * Applied on READ everywhere the stored object is loaded, so the rest of the
 * code only ever deals in current keys. A current value that is already present
 * always wins over the legacy one it would have come from.
 */
export function applyFieldAliases(
  fields: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = { ...fields };

  for (const [legacy, current] of Object.entries(LEGACY_FIELD_ALIASES)) {
    if (out[legacy] === undefined) continue;

    if (!out[current]) out[current] = out[legacy];
    delete out[legacy];
  }

  return out;
}

/**
 * Which store a field's answer belongs in.
 *
 * "credentials" -> signup_fields / role_credentials, private to the account.
 * "columns"     -> a profiles column, readable by anyone who can see the
 *                  profile. See profileColumn on SignupField.
 */
export type FieldScope = "credentials" | "columns" | "all";

function inScope(field: SignupField, scope: FieldScope): boolean {
  if (scope === "all") return true;

  return scope === "columns" ? !!field.profileColumn : !field.profileColumn;
}

/**
 * One form's worth of answers, split into the two places they are stored.
 *
 * Both halves are trimmed with blanks dropped, which is the shape
 * role_credentials rows and the profiles update both want — and it is why a
 * field left empty clears the column rather than writing "".
 */
export function splitSignupValues(
  key: SignupTypeKey,
  values: Record<string, string>
): { credentials: Record<string, string>; columns: Record<string, string> } {
  const credentials: Record<string, string> = {};
  const columns: Record<string, string> = {};

  for (const field of signupType(key).fields) {
    const value = (values[field.key] ?? "").trim();
    if (!value) continue;

    if (field.profileColumn) {
      columns[field.profileColumn] = value;
    } else {
      credentials[field.key] = value;
    }
  }

  return { credentials, columns };
}

/**
 * Required fields of this type that are empty, as { key: message }.
 *
 * THE ONE PLACE REQUIREDNESS IS DECIDED. The signup form, the profile editor
 * and the onboarding route all call this, so "required" cannot mean one thing
 * in a form and another on the server — which is how the Google path came to
 * skip half of what the email path asks for.
 *
 * `scope` exists because the profile editor splits one signup step across two
 * forms with two Save buttons. Checking everything from either of them would
 * report a field that is not on the screen being saved.
 */
export function missingRequiredFields(
  key: SignupTypeKey,
  values: Record<string, string>,
  scope: FieldScope = "all"
): Record<string, string> {
  const missing: Record<string, string> = {};

  for (const field of signupType(key).fields) {
    if (!field.required) continue;
    if (!inScope(field, scope)) continue;
    if ((values[field.key] ?? "").trim()) continue;

    missing[field.key] =
      field.requiredError ?? `Please add your ${field.label.toLowerCase()}.`;
  }

  return missing;
}

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
