import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  SIGNUP_TYPES,
  accountTypeFor,
  legacyRoleFor,
  fieldErrors,
  roleKeysFor,
  signupType as signupTypeDefinition,
  type SignupTypeKey,
} from "@/lib/signupRoles";

/**
 * Finishes onboarding for an account that authenticated with Google.
 *
 * WHY THIS ROUTE EXISTS AT ALL — it is one column.
 *
 * Google authenticates but does not onboard. on_auth_user_created fires at the
 * callback with Google's metadata (name, email, full_name, avatar_url, sub),
 * none of which are the keys handle_new_user() reads, so the row it writes has
 * signup_type NULL, account_type 'individual' and role 'worker' — a plain
 * worker, whatever the person actually is.
 *
 * The browser cannot fix that itself. profiles_guard_signup_type (BEFORE UPDATE,
 * 20260916130000_badges.sql) raises 42501 for any non-admin JWT, and its
 * early-out is `new.signup_type is not distinct from old.signup_type`, which is
 * NULL-safe — so NULL -> 'c10' counts as a change and is refused like any other.
 * Only service_role and no-JWT connections are exempt. Everything else the
 * onboarding write touches (account_type, active_mode, role, active_role,
 * account_roles, role_credentials) is writable from the browser; signup_type is
 * the reason there is a server route.
 *
 * The upside of being here anyway: signup_type is server-assigned for Google
 * accounts, where the email path takes the client's word for it via metadata.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { signupType, fields, columns, location, contactNumber } = (body ??
    {}) as {
    signupType?: unknown;
    fields?: unknown;
    columns?: unknown;
    location?: unknown;
    contactNumber?: unknown;
  };

  // Validated against the real list rather than cast: this value ends up in a
  // column with a CHECK constraint, and a 400 here is a better failure than a
  // constraint violation surfacing as a 500.
  const isKnownType = SIGNUP_TYPES.some((t) => t.key === signupType);
  if (!isKnownType) {
    return NextResponse.json(
      { error: "Choose an account type to continue." },
      { status: 400 }
    );
  }

  const type = signupType as SignupTypeKey;

  // Only the fields this type actually defines, trimmed, blanks dropped — the
  // same shape collectFields() produces on the signup form, so role_credentials
  // rows look identical whichever path created them. Also stops an edited
  // request stuffing arbitrary JSON into the column.
  const claimed: Record<string, string> = {};
  const claimedColumns: Record<string, string> = {};

  for (const field of signupTypeDefinition(type).fields) {
    // Column-backed fields arrive in `columns` keyed by the column name;
    // everything else arrives in `fields` keyed by the field key. Reading each
    // from its own object rather than merging them first is what stops a
    // handcrafted request putting an arbitrary key into a profiles update.
    const source = field.profileColumn ? columns : fields;
    const sourceKey = field.profileColumn ?? field.key;

    if (!source || typeof source !== "object" || Array.isArray(source)) continue;

    const value = (source as Record<string, unknown>)[sourceKey];
    if (typeof value !== "string" || !value.trim()) continue;

    if (field.profileColumn) {
      claimedColumns[field.profileColumn] = value.trim();
    } else {
      claimed[field.key] = value.trim();
    }
  }

  const cleanLocation = typeof location === "string" ? location.trim() : "";
  const cleanContact =
    typeof contactNumber === "string" ? contactNumber.trim() : "";

  // REQUIRED MEANS REQUIRED ON THIS PATH TOO.
  //
  // The Google flow has no details step, so for a long time it collected
  // neither a contact number nor a city, and its credential fields were all
  // optional. Checking here rather than trusting the form is not belt and
  // braces: this is a public endpoint reachable with any valid bearer token,
  // and it is the only writer of these values for a Google account.
  //
  // fieldErrors() is the same function the form calls, so "required"
  // cannot mean two different things at the two ends of this request. The
  // messages come back keyed by field and the form renders them in place.
  //
  // Checked against both halves, keyed the way the FORM keys them, because the
  // messages go back to the form to be rendered under its fields.
  const invalid: Record<string, string> = fieldErrors(type, {
    ...claimed,
    ...Object.fromEntries(
      signupTypeDefinition(type)
        .fields.filter((f) => f.profileColumn)
        .map((f) => [f.key, claimedColumns[f.profileColumn!] ?? ""])
    ),
  });

  if (!cleanContact) {
    invalid.contact_number =
      "A number we can reach you on — it's how someone follows up on a job or an application.";
  }

  if (!cleanLocation) {
    invalid.location =
      "Pick your city so we can show you work near you. Not listed? Choose Other and type it.";
  }

  if (Object.keys(invalid).length > 0) {
    return NextResponse.json(
      { error: "Some details are still missing.", fields: invalid },
      { status: 400 }
    );
  }

  // ONE-TIME. This endpoint completes onboarding; it is not a way to re-type an
  // account later, which is exactly what profiles_guard_signup_type stops the
  // browser doing. Without this check, running the route with service_role
  // would hand back the capability the guard exists to remove.
  const { data: existing, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("signup_type")
    .eq("id", user.id)
    .single();

  if (readError || !existing) {
    console.error(
      "Onboarding: could not read profile",
      JSON.stringify({ userId: user.id, error: readError?.message })
    );
    return NextResponse.json(
      { error: "We couldn't load your account. Please try again." },
      { status: 500 }
    );
  }

  if (existing.signup_type) {
    return NextResponse.json(
      { error: "This account has already been set up." },
      { status: 409 }
    );
  }

  const legacyRole = legacyRoleFor(type);
  const accountType = accountTypeFor(type);

  // Mirrors what handle_new_user() would have written had the metadata been
  // there — same derivation, same columns. full_name is deliberately left
  // alone: the trigger already set it from Google's full_name, and nothing
  // collected here would be better.
  //
  // The contact details are the exception to "same columns". handle_new_user()
  // does read them now (20260918120000), but it ran at the OAuth callback with
  // Google's metadata, which carries none of them — so for a Google account
  // this route is the only thing that ever writes them.
  //
  // claimedColumns is spread last but cannot collide with the type columns
  // above it: it only ever holds keys named by a field's profileColumn, which
  // is a closed union in lib/signupRoles.tsx.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      signup_type: type,
      account_type: accountType,
      active_mode: accountType === "brand" ? "brand" : legacyRole,
      role: legacyRole,
      active_role: legacyRole,
      location: cleanLocation,
      contact_number: cleanContact,
      ...claimedColumns,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error(
      "Onboarding: profile update failed",
      JSON.stringify({ userId: user.id, error: profileError.message })
    );
    return NextResponse.json(
      { error: "We couldn't save your account type. Please try again." },
      { status: 500 }
    );
  }

  // Brand accounts hold no trade role, so roleKeysFor returns [] and both
  // inserts below are skipped — matching the spec's "account_roles is empty for
  // brand accounts" and what the trigger does with the same input.
  const roleKeys = roleKeysFor(type);

  if (roleKeys.length > 0) {
    const { error: rolesError } = await supabaseAdmin
      .from("account_roles")
      .upsert(
        roleKeys.map((key) => ({ profile_id: user.id, role_key: key })),
        { onConflict: "profile_id,role_key", ignoreDuplicates: true }
      );

    if (rolesError) {
      // Not fatal: the profile already carries the account type, which is what
      // the gate and every visible surface read. Logged rather than failed, so
      // a user is not stuck outside the dashboard over a join-table row.
      console.error(
        "Onboarding: account_roles insert failed",
        JSON.stringify({ userId: user.id, error: rolesError.message })
      );
    }

    if (Object.keys(claimed).length > 0) {
      const { error: credentialsError } = await supabaseAdmin
        .from("role_credentials")
        .upsert(
          roleKeys.map((key) => ({
            profile_id: user.id,
            role_key: key,
            fields: claimed,
            // NOTHING HERE IS VERIFIED, and this is the one field that must not
            // drift. These are user-typed licence numbers and certificates.
            // Required false by the backfill rule in
            // 20260909120000_signup_roles_and_account_mode.sql section 6, and
            // by the table's own check (verified = (verified_at is not null)).
            verified: false,
            verified_at: null,
          })),
          { onConflict: "profile_id,role_key", ignoreDuplicates: true }
        );

      if (credentialsError) {
        console.error(
          "Onboarding: role_credentials insert failed",
          JSON.stringify({ userId: user.id, error: credentialsError.message })
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
