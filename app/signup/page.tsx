"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isOnboarded, resolveSignupType } from "@/lib/onboarding";
import {
  SIGNUP_TYPES,
  accountTypeFor,
  legacyRoleFor,
  missingRequiredFields,
  roleKeysFor,
  signupType as signupTypeDefinition,
  splitSignupValues,
  type SignupTypeKey,
} from "@/lib/signupRoles";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE, validatePassword } from "@/lib/passwords";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ScreenLoader } from "@/components/ui/Loading";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { LocationField } from "@/components/ui/LocationField";

/**
 * The steps, by name rather than by number.
 *
 * This used to be `STEP_COUNT = 3` with a bare index, and every check read
 * `step === 1`. Google signup skips the middle step — name and email come from
 * Google and there is no password to set — so an index-based model would mean
 * "if google, skip 1" scattered across validation, the progress bar and the
 * submit branch, each an opportunity to forget. Keying on the id instead means
 * the shortened flow is one shorter array and the count, the labels and
 * "am I on the last step" all follow from it.
 */
type StepId = "type" | "details" | "credentials";

const EMAIL_STEPS: readonly StepId[] = ["type", "details", "credentials"];
const GOOGLE_STEPS: readonly StepId[] = ["type", "credentials"];

/**
 * How a visitor arrived, which decides which steps run.
 *
 * "checking" is not a spinner for its own sake: an OAuth return lands here with
 * the session in the URL fragment, and the client parses that asynchronously.
 * Rendering the email form before that settles would flash the full three-step
 * signup at someone who just authenticated with Google.
 */
type Mode = "checking" | "email" | "google";

/**
 * Matches app/reset-password/page.tsx, the other page that receives an implicit
 * -flow fragment. Long enough for the client to parse and emit, short enough
 * that someone opening /signup directly is not left waiting.
 */
const SESSION_SETTLE_MS = 2500;

const inputClass =
  "w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder:text-gray-400 focus:border-accent focus:outline-none transition";

/**
 * Enough of a check to catch a typo, and no more.
 *
 * Anything stricter rejects addresses that are perfectly valid, and the real
 * proof that an address works is the confirmation email arriving at it.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Ten digits or more, ignoring everything that is not one.
 *
 * Deliberately not a format: people write numbers as (555) 123-4567, 555.123
 * .4567 or +1 555 123 4567 and all three are the same number. Counting digits
 * catches the actual mistake — a number cut short — without telling anyone
 * their punctuation is wrong.
 */
function looksLikePhone(value: string): boolean {
  return (value.match(/\d/g) ?? []).length >= 10;
}

export default function SignupPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("checking");
  /** Read-only, straight from the Google identity. Display only. */
  const [googleIdentity, setGoogleIdentity] = useState<{
    name: string;
    email: string;
  } | null>(null);

  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Single select, no default.
  const [chosenType, setChosenType] = useState<SignupTypeKey | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);

  /**
   * Per field, keyed by the input's name — the credential keys included, since
   * those come from SIGNUP_TYPES and cannot collide with the fixed ones.
   *
   * This used to be a single `error` string shown under the form. With one
   * optional field per step that was enough; with nine required ones it is not
   * — "Please fill in the required fields" under a form of eight inputs makes
   * the user hunt. Each message now sits under the field it is about.
   */
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Submit failures — a rejected signUp, a dead session. Not about one field. */
  const [error, setError] = useState<string | null>(null);

  // Set when signUp returns no session, i.e. email confirmation is on and the
  // account is not usable until the link is clicked.
  const [confirmationSent, setConfirmationSent] = useState(false);

  const isBrand = chosenType === "brand";

  const steps = mode === "google" ? GOOGLE_STEPS : EMAIL_STEPS;
  const currentStep = steps[step];

  /**
   * Contact number and city are asked on the step that exists in BOTH flows.
   *
   * Google skips "details" entirely — name, email and password all come from
   * the provider — so anything asked only there is asked only of email signups.
   * That is how contact number came to be missing from every Google account.
   * The two fields ride along on "credentials" instead when there is no details
   * step to put them on, which keeps the Google flow two steps rather than
   * growing it a third.
   */
  const detailsStepExists = steps.includes("details");

  /**
   * Resolving how this page was reached.
   *
   * Three outcomes, and all three have to be handled or an OAuth return either
   * hangs or shows the wrong form:
   *
   *   1. No session — an ordinary visitor. The full email flow, unchanged.
   *   2. A session with a signup_type — already onboarded. Nothing to do here,
   *      so send them on. This is also what catches a returning Google user who
   *      clicked the button on this page rather than on /login.
   *   3. A session without one — authenticated with Google but never onboarded.
   *      The shortened flow.
   *
   * The same three-way settle as app/reset-password/page.tsx, and for the same
   * reason: lib/supabase.tsx is a bare createClient, so flowType is 'implicit'
   * and the tokens arrive in the URL fragment. detectSessionInUrl parses it, but
   * asynchronously — subscribing alone misses a session that was already parsed
   * before this effect ran, and getSession alone races the parse. The timeout is
   * what stops a visitor with no session waiting forever for an event that is
   * never coming.
   */
  useEffect(() => {
    let settled = false;

    async function resolve(hasSession: boolean) {
      if (settled) return;
      settled = true;

      if (!hasSession) {
        setMode("email");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMode("email");
        return;
      }

      // Both sources, same resolver the dashboard gate uses. If these two
      // disagreed about one account it would bounce between the two pages.
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("signup_type, location, contact_number")
        .eq("id", user.id)
        .single();

      if (
        isOnboarded(
          resolveSignupType(user.user_metadata?.signup_type, profileRow?.signup_type)
        )
      ) {
        router.replace("/dashboard");
        return;
      }

      // Prefilled, not assumed. The signup trigger fired at the callback with
      // Google's metadata, which carries no city — but an account that has been
      // here before, or was edited by an admin, may already have one, and
      // making them retype it would be the form ignoring what it knows.
      if (typeof profileRow?.location === "string") {
        setLocation(profileRow.location);
      }

      if (typeof profileRow?.contact_number === "string") {
        setContactNumber(profileRow.contact_number);
      }

      setGoogleIdentity({
        name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : "",
        email: user.email ?? "",
      });
      setMode("google");
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Guarded on the session, not the event name: INITIAL_SESSION fires
        // immediately with null and treating that as an answer would race the
        // fragment parse.
        if (session) resolve(true);
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) resolve(true);
    });

    const timer = setTimeout(() => resolve(false), SESSION_SETTLE_MS);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  const stepTitles: Record<StepId, string> = {
    type: "What best describes you?",
    // A brand account is an organisation; this step collects the person who
    // runs it, not the account holder's own identity.
    details: isBrand ? "Who's managing this account?" : "Your details",
    credentials: isBrand ? "About your brand" : "Your credentials",
  };

  function setField(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    clearError(key);
  }

  /** Clears one field's message as soon as it is being fixed. */
  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;

      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /**
   * The chosen type's answers, split into the two places they are stored —
   * signup_fields for the credentials, profiles columns for the rest. Filtering
   * by the current type also drops anything typed under a type they later
   * changed away from.
   */
  function collectValues() {
    if (!chosenType) return { credentials: {}, columns: {} };

    return splitSignupValues(chosenType, fieldValues);
  }

  /**
   * Contact number and city, wherever they are being asked.
   *
   * Split out from the rest of the details step so the Google flow can run the
   * same two checks on the credentials step without also demanding a password
   * nobody set.
   */
  function validateContactAndLocation() {
    const found: Record<string, string> = {};

    if (!contactNumber.trim()) {
      found.contact_number =
        "A number we can reach you on — it's how someone follows up on a job or an application.";
    } else if (!looksLikePhone(contactNumber)) {
      found.contact_number =
        "That's too short for a phone number — include the area code.";
    }

    if (!location.trim()) {
      found.location =
        "Pick your city so we can show you work near you. Not listed? Choose Other and type it.";
    }

    return found;
  }

  /** Everything the details step asks for. */
  function validateDetails() {
    const found: Record<string, string> = {};

    if (!firstName.trim()) {
      found.first_name = "Your first name — it's what other trades see on your profile.";
    }

    if (!lastName.trim()) {
      found.last_name = "And your last name.";
    }

    if (!email.trim()) {
      found.email = "The email address you'll sign in with.";
    } else if (!looksLikeEmail(email.trim())) {
      found.email = "That doesn't look like an email address — check for a typo.";
    }

    Object.assign(found, validateContactAndLocation());

    // Caught on the way out of this step, not at final submit two steps
    // later — being sent back to fix a password after filling in credentials
    // is the kind of thing that loses a signup.
    const invalidPassword = validatePassword(password, confirmPassword);
    if (invalidPassword) found.password = invalidPassword;

    return found;
  }

  /**
   * The chosen type's required fields, plus the two shared ones when this step
   * is where they are being asked.
   */
  function validateCredentials() {
    if (!chosenType) return { type: "Please choose one to continue." };

    const found = missingRequiredFields(chosenType, fieldValues);

    if (!detailsStepExists) Object.assign(found, validateContactAndLocation());

    return found;
  }

  function goBack() {
    setError(null);
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    setError(null);

    const found =
      currentStep === "type"
        ? chosenType
          ? {}
          : { type: "Please choose one to continue." }
        : currentStep === "details"
        ? validateDetails()
        : validateCredentials();

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  /**
   * Enter, and the primary button, on every step.
   *
   * A multi-step wizard still wants to be one <form>: on the middle steps
   * submitting means "next", and only on the last does it mean "create the
   * account". Routing both through here keeps the keyboard and the button on
   * exactly the same path, so Enter can never skip a step's validation.
   */
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isLastStep) {
      // Two different write paths, and they are not variations on each other.
      // The email flow creates the auth user; the Google one already has one,
      // created by the callback, and is filling in what Google could not tell
      // us. See handleCompleteOAuth.
      if (mode === "google") {
        handleCompleteOAuth();
      } else {
        handleSignup();
      }
      return;
    }

    goNext();
  }

  /**
   * Finishes onboarding for an account that already exists because Google
   * created it.
   *
   * NOT signUp. The auth user and its profiles row were both made at the
   * callback, by on_auth_user_created firing with Google's metadata — which
   * carries no signup_type, so the row landed as a plain 'individual'/'worker'.
   * There is nothing to create here, only to correct.
   *
   * Two writes, in this order, and the order matters:
   *
   *   1. The API route, because profiles.signup_type CANNOT be written from the
   *      browser. profiles_guard_signup_type raises 42501 for any non-admin
   *      JWT, including a first write over NULL. The route holds service_role.
   *      It also writes profiles.location, and re-checks every required field
   *      rather than trusting this form to have done it.
   *   2. updateUser, for raw_user_meta_data. Everything that already reads
   *      signup_type and signup_fields off the auth user keeps working —
   *      useActiveRole's brand name, app/dashboard/profile/page.tsx — and it
   *      refreshes the local session, so the dashboard sees the new values
   *      without a reload.
   *
   * Route first: if the second call fails, the column is set and resolveSignupType
   * still finds it, so the gate lets them through and the only loss is metadata
   * that the profile editor can rewrite. The reverse order would leave metadata
   * claiming an account type the database does not have.
   */
  async function handleCompleteOAuth() {
    setError(null);

    if (!chosenType) {
      setErrors({ type: "Please choose one to continue." });
      return;
    }

    const found = validateCredentials();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSubmitting(false);
      setError("Your session expired. Please sign in with Google again.");
      return;
    }

    const { credentials, columns } = collectValues();

    const response = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      // No user id in the body — the route takes it from the token. Sending one
      // would be the exact shape of the two Stripe checkout bugs.
      //
      // The route writes every one of these to profiles with service_role. It
      // has to: a Google account's row was created at the OAuth callback, by
      // the trigger, from metadata that carried none of this.
      body: JSON.stringify({
        signupType: chosenType,
        fields: credentials,
        columns,
        location: location.trim(),
        contactNumber: contactNumber.trim(),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setSubmitting(false);

      // The route returns per-field messages for the same checks this form
      // runs. Showing them against their fields rather than as one sentence
      // means a server-side rejection reads the same as a client-side one.
      if (body?.fields && typeof body.fields === "object") {
        setErrors(body.fields as Record<string, string>);
        return;
      }

      setError(body?.error ?? "We couldn't finish setting up your account.");
      return;
    }

    // Same keys the email path writes, so nothing downstream has to know which
    // flow produced the account. updateUser merges, so Google's own metadata
    // (name, avatar_url, sub) survives alongside these.
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
        full_name: googleIdentity?.name ?? "",
        contact_number: contactNumber.trim(),
        location: location.trim(),
        years_experience: columns.years_experience ?? "",
        role: legacyRoleFor(chosenType),
        signup_type: chosenType,
        account_type: accountTypeFor(chosenType),
        roles: roleKeysFor(chosenType),
        signup_fields: credentials,
      },
    });

    setSubmitting(false);

    if (metadataError) {
      // Deliberately not fatal. The route already wrote the column, so the
      // account is onboarded as far as the gate and the database are concerned,
      // and blocking the user here would strand them outside a dashboard they
      // can legitimately enter.
      console.error("Onboarding metadata update failed:", metadataError.message);
    }

    router.push("/dashboard");
  }

  async function handleSignup() {
    setError(null);

    // Re-checked at submit as well as on the step transition: the user can go
    // back and edit an earlier step after passing it once.
    const found = { ...validateDetails(), ...validateCredentials() };
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // The details step is where the first of these lives, and it is behind
      // them — send them to it rather than showing a message about a field
      // that is not on screen.
      const detailKeys = [
        "first_name",
        "last_name",
        "email",
        "contact_number",
        "location",
        "password",
      ];

      if (detailKeys.some((k) => found[k])) setStep(steps.indexOf("details"));
      return;
    }

    if (!chosenType) {
      setErrors({ type: "Please choose one to continue." });
      return;
    }

    const type: SignupTypeKey = chosenType;

    setSubmitting(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const { credentials, columns } = collectValues();

    // ONE WRITE. Everything this form collects goes into options.data, and
    // handle_new_user() turns it into the profiles row.
    //
    // There is no follow-up update from the browser and there must not be. With
    // email confirmation on — production — signUp returns no session, so there
    // is no authenticated connection to run one with until the user clicks the
    // link. An earlier version wrote profiles.location here and reconciled the
    // confirmation case on first dashboard load; that was two writers for one
    // fact, running at different times, and 20260918120000 replaced both by
    // teaching the trigger to read location, contact_number and
    // years_experience.
    //
    // account_type and roles are derived from the one signup choice rather
    // than asked for separately, so the backfill documented in
    // supabase/migrations/20260909120000_signup_roles_and_account_mode.sql
    // section 6 keeps the source it expects.
    //
    // years_experience is sent at the top level rather than inside
    // signup_fields because it is stored in a profiles column — it is printed
    // on other people's screens, and signup_fields is private to the account.
    // splitSignupValues() is what decides that; see profileColumn in
    // lib/signupRoles.tsx.
    //
    // raw_user_meta_data is CLIENT-WRITABLE. Anything read back out of it is
    // user-claimed, never verified. The trigger validates what it can —
    // account_type, signup_type, role keys — and stores the contact details as
    // given, because they grant nothing.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          contact_number: contactNumber.trim(),
          location: location.trim(),
          years_experience: columns.years_experience ?? "",
          role: legacyRoleFor(type),
          signup_type: type,
          account_type: accountTypeFor(type),
          roles: roleKeysFor(type),
          signup_fields: credentials,
        },
      },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Email confirmation is off on staging, so signUp returns a session and we
    // go straight to the dashboard. It is ON in production, which takes the
    // no-session branch below and renders the "check your email" screen.

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

  // Held until the OAuth fragment has had its chance to settle. Without this a
  // Google return renders the full email form — type choice, name, email,
  // password — for a moment before swapping to the two-step one, which reads as
  // the sign-in having failed.
  if (mode === "checking") {
    return <ScreenLoader message="Checking your session" />;
  }

  if (confirmationSent) {
    return (
      <AuthLayout>
        <>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8">
            <h2 className="text-xl font-semibold mb-1">Check your email</h2>
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

          <p className="text-center text-sm text-gray-400 mt-6">
            Already confirmed?{" "}
            <Link href="/login" className="text-accent-2-soft hover:underline">
              Log in
            </Link>
          </p>
        </>
      </AuthLayout>
    );
  }

  const isLastStep = step === steps.length - 1;

  const activeType = chosenType ? signupTypeDefinition(chosenType) : null;

  /** One message, under the field it belongs to. */
  function fieldError(key: string) {
    if (!errors[key]) return null;

    return <p className="text-xs text-rose-400 mt-1">{errors[key]}</p>;
  }

  /** The contact number and city pair, shared by both steps that can host it. */
  const contactAndLocation = (
    <>
      <div>
        <label htmlFor="contact_number" className="block text-xs text-gray-400 mb-1">
          Contact number
        </label>
        <input
          id="contact_number"
          type="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          className={inputClass}
          value={contactNumber}
          onChange={(e) => {
            setContactNumber(e.target.value);
            clearError("contact_number");
          }}
        />
        {fieldError("contact_number")}
      </div>

      <LocationField
        id="location"
        value={location}
        onChange={(next) => {
          setLocation(next);
          clearError("location");
        }}
        className={inputClass}
        labelClassName="block text-xs text-gray-400 mb-1"
        error={errors.location}
      />
    </>
  );

  return (
    <AuthLayout>
      <>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8">
          {/* Progress */}
          <div className="mb-6">
            <div className="flex gap-1.5 mb-3">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition ${
                    i <= step ? "bg-accent" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{stepTitles[currentStep]}</h2>
              <span className="text-xs text-gray-400 shrink-0 ml-3 font-technical">
                {step + 1} of {steps.length}
              </span>
            </div>
          </div>

          {/* A real <form> so Enter submits the step from any field. Every
              other button inside it — the type choices on step 0, Back — is
              explicitly type="button", which is what stops them submitting it;
              a button with no type inside a form defaults to submit. */}
          <form onSubmit={handleFormSubmit}>
            {/* Step 1 — single select */}
            {currentStep === "type" && (
            <div className="space-y-2">
              {/* ABOVE the cards, and only before anything is chosen.
                  Leaving for Google discards this page's state, so the one
                  moment it costs nothing is while there is nothing to lose.
                  Putting it under the cards would invite a click right after
                  picking a type, which would silently throw that choice away. */}
              {mode === "email" && (
                <>
                  <GoogleButton redirectPath="/signup" onError={setError} />
                  <p className="text-xs text-gray-400 pt-1">
                    We&apos;ll ask what you do when you come back.
                  </p>
                  <OrDivider />
                </>
              )}

              {/* Shown once Google has authenticated but before onboarding is
                  finished. Read-only text, not inputs: these came from Google
                  and are already on the account, so offering them as editable
                  fields would imply this form could change them. */}
              {mode === "google" && googleIdentity && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 mb-2">
                  <p className="text-xs text-gray-400">Signed in with Google</p>
                  {googleIdentity.name && (
                    <p className="text-sm font-semibold mt-1">
                      {googleIdentity.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {googleIdentity.email}
                  </p>
                </div>
              )}

              {SIGNUP_TYPES.map((type) => {
                const selected = chosenType === type.key;

                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => {
                      setChosenType(type.key);
                      clearError("type");
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

              {fieldError("type")}

              <p className="text-xs text-gray-400 pt-1">
                Do more than one? You can add more to your profile later.
              </p>
            </div>
          )}

          {/* Step 2 — details */}
          {currentStep === "details" && (
            <div className="space-y-3">
              {/* Labels only — the fields, validation and write path are the
                  same for every signup type. */}
              {isBrand && (
                <p className="text-xs text-gray-400 -mt-1">
                  We&apos;ll contact this person about campaigns.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    autoComplete="given-name"
                    placeholder={isBrand ? "Contact first name" : "First name"}
                    aria-label={isBrand ? "Contact first name" : "First name"}
                    className={inputClass}
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      clearError("first_name");
                    }}
                  />
                  {fieldError("first_name")}
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    autoComplete="family-name"
                    placeholder={isBrand ? "Contact last name" : "Last name"}
                    aria-label={isBrand ? "Contact last name" : "Last name"}
                    className={inputClass}
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      clearError("last_name");
                    }}
                  />
                  {fieldError("last_name")}
                </div>
              </div>

              <div>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  aria-label="Email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                />
                {fieldError("email")}
              </div>

              {contactAndLocation}

              <div>
                <PasswordInput
                  placeholder="Password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  className={inputClass}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError("password");
                  }}
                />
                {/* The rule is shown before anything is typed, not after a
                    rejected submit. */}
                <p className="text-xs text-gray-400 mt-1">{PASSWORD_RULE}</p>
                {fieldError("password")}
              </div>

              <PasswordInput
                placeholder="Confirm password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearError("password");
                }}
              />
            </div>
          )}

          {/* Step 3 — the chosen type's fields, rendered directly */}
          {currentStep === "credentials" && activeType && (
            <div className="space-y-3">
              {/* The Google flow has no details step, so the two fields it
                  would have asked for are asked here. Set off with its own
                  heading rather than dropped in among the credentials, which
                  are a different question. */}
              {!detailsStepExists && (
                <div className="space-y-3 pb-4 mb-1 border-b border-zinc-800">
                  <p className="text-xs text-gray-400">
                    Google didn&apos;t give us these.
                  </p>
                  {contactAndLocation}
                </div>
              )}

              {activeType.fields.map((field) => {
                const value = fieldValues[field.key] ?? "";

                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`signup-${field.key}`}
                      className="block text-xs text-gray-400 mb-1"
                    >
                      {field.label}
                      {!field.required && (
                        <span className="text-gray-500"> (optional)</span>
                      )}
                    </label>

                    {field.type === "textarea" ? (
                      <textarea
                        id={`signup-${field.key}`}
                        rows={field.rows ?? 3}
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className={`${inputClass} resize-none`}
                      />
                    ) : field.type === "select" ? (
                      <select
                        id={`signup-${field.key}`}
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select one</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`signup-${field.key}`}
                        type="text"
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className={inputClass}
                      />
                    )}

                    {field.hint && (
                      <p className="text-xs text-gray-500 mt-1">{field.hint}</p>
                    )}
                    {fieldError(field.key)}
                  </div>
                );
              })}
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
              type="submit"
              disabled={submitting}
              className="flex-1 bg-accent text-on-accent p-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50"
            >
              <ButtonSpinner active={submitting} />
              {/* "Create Account" would be a lie in Google mode — the auth user
                  and its profile row were both created at the callback, and
                  this submit only fills in what Google could not tell us. */}
              {submitting
              ? mode === "google"
                ? "Finishing setup..."
                : "Creating account..."
              : isLastStep
              ? mode === "google"
                ? "Finish setup"
                : "Create Account"
              : "Continue"}
            </button>
          </div>
          </form>
        </div>

        <p className="text-center text-sm text-gray-400 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-accent-2-soft hover:underline">
            Log in
          </Link>
        </p>

        <LegalLinks />
      </>
    </AuthLayout>
  );
}
