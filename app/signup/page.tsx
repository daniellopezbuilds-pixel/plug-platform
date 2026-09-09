"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  SIGNUP_TYPES,
  accountTypeFor,
  legacyRoleFor,
  roleKeysFor,
  signupType as signupTypeDefinition,
  type SignupTypeKey,
} from "@/lib/signupRoles";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, validatePassword } from "@/lib/passwords";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

const STEP_COUNT = 3;

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

export default function SignupPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Single select, no default.
  const [chosenType, setChosenType] = useState<SignupTypeKey | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set when signUp returns no session, i.e. email confirmation is on and the
  // account is not usable until the link is clicked.
  const [confirmationSent, setConfirmationSent] = useState(false);

  const isBrand = chosenType === "brand";

  const stepTitles = [
    "What best describes you?",
    // A brand account is an organisation; step 2 collects the person who runs
    // it, not the account holder's own identity.
    isBrand ? "Who's managing this account?" : "Your details",
    isBrand ? "About your brand" : "Your credentials",
  ];

  function setField(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Values for the chosen type's fields only, blanks stripped. Filtering by the
   * current type also drops anything typed under a type they later changed
   * away from.
   */
  function collectFields() {
    if (!chosenType) return {};

    const collected: Record<string, string> = {};

    for (const field of signupTypeDefinition(chosenType).fields) {
      const value = (fieldValues[field.key] ?? "").trim();
      if (value !== "") collected[field.key] = value;
    }

    return collected;
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    setError(null);

    if (step === 0 && !chosenType) {
      setError("Please choose one to continue.");
      return;
    }

    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Please enter your first and last name.");
        return;
      }

      if (!email.trim()) {
        setError("Please enter your email address.");
        return;
      }

      // Caught on the way out of this step, not at final submit two steps
      // later — being sent back to fix a password after filling in credentials
      // is the kind of thing that loses a signup.
      const invalidPassword = validatePassword(password, confirmPassword);
      if (invalidPassword) {
        setError(invalidPassword);
        return;
      }
    }

    setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
  }

  async function handleSignup() {
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    // Re-checked at submit as well as on the step transition: the user can go
    // back and edit step 2 after passing it once.
    const invalidPassword = validatePassword(password, confirmPassword);
    if (invalidPassword) {
      setError(invalidPassword);
      return;
    }

    if (!chosenType) {
      setError("Please choose one to continue.");
      return;
    }

    const type: SignupTypeKey = chosenType;

    setSubmitting(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // Write path unchanged: same signUp call, same options.data object, with
    // extra keys added for later backfill.
    //
    // account_type and roles are derived from the one signup choice rather
    // than asked for separately, so the backfill documented in
    // supabase/pending.sql keeps the source it expects.
    //
    // raw_user_meta_data is CLIENT-WRITABLE. Anything read back out of it is
    // user-claimed, never verified. The backfill that eventually moves these
    // into account_roles and role_credentials must treat them accordingly and
    // set role_credentials.verified = false for every row it creates.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          contact_number: contactNumber.trim(),
          role: legacyRoleFor(type),
          signup_type: type,
          account_type: accountTypeFor(type),
          roles: roleKeysFor(type),
          signup_fields: collectFields(),
        },
      },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Email confirmation is off today, so signUp returns a session and we go
    // straight to the dashboard. Turning confirmation back on needs no code
    // change — it just starts taking the no-session branch below, which
    // renders the "check your email" screen.

    if (!data.session) {
      // No session means confirmation is required after all. Never assume it
      // is there.
      //
      // This used to be alert() followed by a redirect to /login. A browser
      // alert cannot carry the spam-folder hint below it, and it dumped the
      // user on the login page where nothing explained why they could not log
      // in yet. Rendered as a screen instead.
      setConfirmationSent(true);
      return;
    }

    router.push("/dashboard");
  }

  if (confirmationSent) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold">
              Sparx Plug <span className="text-accent-2-soft">Ecosystem</span>
            </h1>
            <p className="text-gray-400 text-sm mt-1">Connect. Build. Grow.</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold mb-1">Check your email</h2>
            <p className="text-sm text-gray-400">
              We&apos;ve sent a confirmation link to{" "}
              <span className="text-white">{email.trim()}</span>. Click it to
              finish setting up your account.
            </p>
            {/* The sending domain is new and shares history with another
                sender, so Gmail is filing these as spam. Muted and secondary
                on purpose — a hint for the person who comes back confused, not
                a warning. Remove it once domain reputation settles. */}
            <p className="text-xs text-gray-500 mt-3">
              If you don&apos;t see it, check your spam folder.
            </p>
          </div>

          <p className="text-center text-sm text-gray-400 mt-5">
            Already confirmed?{" "}
            <Link href="/login" className="text-accent-2-soft hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const isLastStep = step === STEP_COUNT - 1;

  const activeType = chosenType ? signupTypeDefinition(chosenType) : null;

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">
            Sparx Plug <span className="text-accent-2-soft">Ecosystem</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Connect. Build. Grow.</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          {/* Progress */}
          <div className="mb-6">
            <div className="flex gap-1.5 mb-3">
              {Array.from({ length: STEP_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition ${
                    i <= step ? "bg-accent" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{stepTitles[step]}</h2>
              <span className="text-xs text-gray-400 shrink-0 ml-3">
                {step + 1} of {STEP_COUNT}
              </span>
            </div>
          </div>

          {/* Step 1 — single select */}
          {step === 0 && (
            <div className="space-y-2">
              {SIGNUP_TYPES.map((type) => {
                const selected = chosenType === type.key;

                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => {
                      setChosenType(type.key);
                      setError(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition flex items-start gap-3 ${
                      selected
                        ? "border-accent bg-transparent"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        selected ? "border-accent" : "border-zinc-700"
                      }`}
                    >
                      {selected && (
                        <span className="h-2 w-2 rounded-full bg-accent" />
                      )}
                    </span>
                    <span>
                      <span className="block font-semibold text-sm">
                        {type.label}
                      </span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {type.description}
                      </span>
                    </span>
                  </button>
                );
              })}

              <p className="text-xs text-gray-400 pt-1">
                Do more than one? You can add more to your profile later.
              </p>
            </div>
          )}

          {/* Step 2 — details */}
          {step === 1 && (
            <div className="space-y-3">
              {/* Labels only — the fields, validation and write path are the
                  same for every signup type. */}
              {isBrand && (
                <p className="text-xs text-gray-400 -mt-1">
                  We&apos;ll contact this person about campaigns.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder={isBrand ? "Contact first name" : "First name"}
                  className={inputClass}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <input
                  type="text"
                  placeholder={isBrand ? "Contact last name" : "Last name"}
                  className={inputClass}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>

              <input
                type="email"
                placeholder="Email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="tel"
                placeholder="Contact number (optional)"
                className={inputClass}
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
              />

              <div>
                <input
                  type="password"
                  placeholder="Password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {/* The rule is shown before anything is typed, not after a
                    rejected submit. */}
                <p className="text-xs text-gray-400 mt-1">{PASSWORD_RULE}</p>
              </div>

              <input
                type="password"
                placeholder="Confirm password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          {/* Step 3 — the chosen type's fields, rendered directly */}
          {step === 2 && activeType && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                All optional — add what you have, skip the rest.
              </p>

              {activeType.fields.map((field) =>
                field.type === "textarea" ? (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-400 mb-1">
                      {field.label}
                    </label>
                    <textarea
                      rows={field.rows ?? 3}
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                ) : (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-400 mb-1">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={fieldValues[field.key] ?? ""}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-rose-400 bg-rose-950/40 border border-rose-900 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6 [&>button]:min-h-11">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="px-4 py-3 rounded-lg border border-zinc-700 text-gray-300 font-medium hover:border-zinc-700 hover:text-white transition inline-flex items-center justify-center gap-2"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={isLastStep ? handleSignup : goNext}
              disabled={submitting}
              className="flex-1 bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50"
            >
              <ButtonSpinner active={submitting} />
              {submitting
              ? "Creating account..."
              : isLastStep
              ? "Create Account"
              : "Continue"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-5">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-2-soft hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
