"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import { uploadResume, getResumeSignedUrl } from "@/lib/resume";
import { uploadLogo, uploadBanner, getBrandingPublicUrl } from "@/lib/branding";
import { uploadEmployerDocument, getEmployerDocumentSignedUrl } from "@/lib/employerDocuments";
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";
import { BadgesSection } from "@/components/profile/BadgesSection";
import { PageWithRail } from "@/components/layout/PageWithRail";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";
import {
  SIGNUP_TYPES,
  EXPERIENCE_BANDS,
  applyFieldAliases,
  missingRequiredFields,
  roleKeysFor,
} from "@/lib/signupRoles";
import { PageHeading } from "@/components/layout/PageHeading";
import { PageLoader } from "@/components/ui/Loading";
import { InlineLoader } from "@/components/ui/Loading";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useToast } from "@/components/ui/Toast";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { TRADES, OTHER_TRADE, isListedTrade } from "@/lib/trades";
import { nudgeEmailQueue } from "@/lib/emailOutbox";
import { LocationField } from "@/components/ui/LocationField";

export default function ProfilePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [trade, setTrade] = useState("");

  /**
   * Whether the free-text trade box is showing because the user PICKED "Other",
   * as opposed to because their saved trade is not in the list.
   *
   * Two separate reasons to show the same input, and it needs both: deriving it
   * from `trade` alone cannot distinguish "Other, nothing typed yet" (trade is
   * "") from "nothing selected yet" (also ""), so choosing Other would
   * immediately hide the box the user just asked for.
   */
  const [tradeIsOther, setTradeIsOther] = useState(false);

  /** Either reason opens the box: an explicit "Other", or an unlisted value. */
  const showOtherTrade = tradeIsOther || (!!trade && !isListedTrade(trade));

  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");

  /**
   * profiles.contact_number, added by 20260918120000.
   *
   * Before that it existed only in auth user_metadata: signup wrote it there
   * and nothing ever read it back, so every number collected since launch was
   * write-only. The migration added the column and backfilled it from metadata.
   * Metadata still carries it at signup, because that is how the value reaches
   * handle_new_user() — but the column is what anything reads.
   */
  const [contactNumber, setContactNumber] = useState("");
  const [unionStatus, setUnionStatus] = useState<string | null>(null);
  const [unionVerified, setUnionVerified] = useState(false);
  const [yearsExperience, setYearsExperience] = useState("");
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyBannerPath, setCompanyBannerPath] = useState<string | null>(null);
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [employerDocPath, setEmployerDocPath] = useState<string | null>(null);
  const [employerDocLabel, setEmployerDocLabel] = useState<string | null>(null);
  const [uploadingEmployerDoc, setUploadingEmployerDoc] = useState(false);
  const [employerVerified, setEmployerVerified] = useState(false);

  // From auth user_metadata, written at signup. Client-writable, so this is
  // display only — never gate anything on it.
  const [signupTypeKey, setSignupTypeKey] = useState<string | null>(null);
  const [signupFields, setSignupFields] = useState<Record<string, string>>({});

  /**
   * The signup credentials as they were when this page loaded.
   *
   * Kept alongside the editable copy so the form can tell whether anything
   * actually changed — which is what decides whether saving will clear an
   * existing verification, and therefore whether to warn about it.
   */
  const [savedSignupFields, setSavedSignupFields] = useState<
    Record<string, string>
  >({});

  /**
   * Whether any of this account's role_credentials rows are currently verified.
   *
   * Read from role_credentials, not metadata: `verified` only exists on the
   * table, and it is the thing an edit is about to cost them.
   */
  const [credentialsVerified, setCredentialsVerified] = useState(false);
  const [savingSignupFields, setSavingSignupFields] = useState(false);

  /**
   * Per-field messages for the required credentials, keyed by field key.
   *
   * Required-ness is decided by missingRequiredFields() — the same function the
   * signup form and the onboarding route use — so an account cannot be edited
   * into a state signup would have refused to create.
   */
  const [signupFieldErrors, setSignupFieldErrors] = useState<
    Record<string, string>
  >({});

  /**
   * Messages for the signup fields that are stored in profiles columns and so
   * are edited in the main form rather than in the credentials section. Keyed
   * by field key, same as signupFieldErrors — separate state because they are
   * saved by a different button.
   */
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const { reviews, averageRating, count } = useReviews(userId || null);
  const { hiredCount, jobsLandedCount } = useProfileStats(userId || null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const meta = user.user_metadata ?? {};
      setSignupTypeKey(
        typeof meta.signup_type === "string" ? meta.signup_type : null
      );
      // Coerce defensively: metadata is client-writable, so a value could be
      // any JSON, and only strings are renderable here.
      const metaFields: Record<string, string> =
        meta.signup_fields && typeof meta.signup_fields === "object"
          ? Object.fromEntries(
              Object.entries(meta.signup_fields as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string")
                .map(([k, v]) => [k, v as string])
            )
          : {};

      /**
       * role_credentials FIRST, metadata as the fallback.
       *
       * The two stores hold the same values and disagree in two directions.
       * role_credentials is the server-held one, written by the signup trigger
       * and the onboarding route, and it is the only one carrying `verified` —
       * so it wins where it exists. Metadata is the fallback because brand
       * accounts have NO role_credentials rows at all (roleKeysFor("brand") is
       * empty by design), and because a row can be missing for anyone who
       * signed up before that table existed.
       */
      const { data: credentialRows } = await supabase
        .from("role_credentials")
        .select("fields, verified")
        .eq("profile_id", user.id);

      const credentialFields: Record<string, string> = {};
      let anyVerified = false;

      for (const row of credentialRows ?? []) {
        if (row.verified) anyVerified = true;

        if (row.fields && typeof row.fields === "object") {
          for (const [k, v] of Object.entries(row.fields as Record<string, unknown>)) {
            if (typeof v === "string") credentialFields[k] = v;
          }
        }
      }

      // Aliased on read, so a key collected under an old name (instructor's
      // `certificate`) shows up in the field that replaced it rather than
      // vanishing — the save below rebuilds this object from the CURRENT field
      // list, so anything not rendered is anything not kept.
      const resolvedFields = applyFieldAliases(
        Object.keys(credentialFields).length > 0 ? credentialFields : metaFields
      );

      setSignupFields(resolvedFields);
      setSavedSignupFields(resolvedFields);
      setCredentialsVerified(anyVerified);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.from("profiles").insert({
          id: user.id,
          email: user.email,
          xp: 0,
        });

        setLoading(false);
        return;
      }

      setProfileNumber(profile.profile_number || "");
      setFullName(profile.full_name || "");
      setUsername(profile.username || "");
      setTrade(profile.trade || "");
      // A saved trade that is not in the list — typed before the list existed,
      // or entered through Other — opens the free-text box so it is editable
      // rather than silently unreachable behind a select that cannot show it.
      setTradeIsOther(!!profile.trade && !isListedTrade(profile.trade));
      setBio(profile.bio || "");
      setLocation(profile.location || "");
      setUnionStatus(profile.union_status || null);
      setUnionVerified(profile.union_verified || false);
      setContactNumber(profile.contact_number || "");
      // A band now, not an integer — 20260918120000 converted the column and
      // every value in it. A row still holding something outside the band list
      // is kept selectable by the select below rather than silently replaced.
      setYearsExperience(profile.years_experience || "");
      setResumePath(profile.resume_path || null);

      setCompanyLogoPath(profile.company_logo_path || null);
      setCompanyBannerPath(profile.company_banner_path || null);
      setCompanyDescription(profile.company_description || "");
      setCompanyWebsite(profile.company_website || "");
      setEmployerVerified(profile.employer_verified || false);

      const { data: doc } = await supabase
        .from("employer_documents")
        .select("label, file_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (doc) {
        setEmployerDocLabel(doc.label);
        setEmployerDocPath(doc.file_path);
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSave() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // The column-backed signup fields are edited HERE, not in the credentials
    // section below, so this is where their required-ness is enforced. Scoped
    // to "columns" so this Save cannot complain about a licence number that
    // belongs to the other form and is not on screen.
    const invalidColumns = signupTypeDef
      ? missingRequiredFields(
          signupTypeDef.key,
          { years_experience: yearsExperience },
          "columns"
        )
      : {};

    setProfileErrors(invalidColumns);

    if (Object.keys(invalidColumns).length > 0) {
      toast.error("Some details are still needed before this can be saved.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        trade,
        bio,
        location,
        contact_number: contactNumber.trim() || null,
        union_status: unionStatus,
        union_verified: false,
        // Plain text since 20260918120000 — no parseInt, and an empty select
        // stores NULL rather than "" so `is null` keeps meaning "not answered".
        years_experience: yearsExperience || null,
        company_description: companyDescription,
        company_website: companyWebsite,
      })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    setUnionVerified(false);
    toast.success("Profile updated successfully.");
  }

  /**
   * Saves the signup credentials to BOTH stores.
   *
   * role_credentials is the real one — it is server-held and it is what carries
   * `verified`. Metadata is written too because several places still read it:
   * useActiveRole derives a brand's display name from
   * user_metadata.signup_fields.brand_name, and this page falls back to it for
   * accounts with no credential rows. Writing one and not the other would leave
   * the two disagreeing, which is the state the fallback read exists to survive
   * — not one to create deliberately.
   *
   * WHAT RESETS VERIFICATION. Nothing here does. The BEFORE UPDATE trigger
   * added in 20260917120000 clears verified/verified_at whenever `fields`
   * changes, for every writer. This function only has to tell the user it is
   * about to happen; it could not be trusted to do the clearing itself, because
   * `grant update (fields)` means any client can write this column without
   * going through this code at all.
   *
   * Brand accounts take the metadata half only: roleKeysFor("brand") is empty,
   * so there are no credential rows to update and nothing to verify.
   */
  async function handleSaveSignupFields() {
    if (!signupTypeDef) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Only this type's fields, trimmed, blanks dropped — the same shape
    // collectFields() produces at signup, so a row written here is
    // indistinguishable from one written by the trigger.
    // Column-backed fields are skipped: they are not credentials, they are not
    // rendered in this section, and including them would write a copy into
    // role_credentials that nothing reads and that goes stale the moment the
    // main form saves.
    const cleaned: Record<string, string> = {};
    for (const field of signupTypeDef.fields) {
      if (field.profileColumn) continue;

      const value = (signupFields[field.key] ?? "").trim();
      if (value) cleaned[field.key] = value;
    }

    // Checked against the same function signup and the onboarding route use.
    // Without it the profile editor would be a way to empty a field that
    // signup insists on — a licence number cleared here would leave an account
    // in a state the form that created it would have refused.
    //
    // "credentials" only: the column-backed fields are on the main form above
    // and are checked by its own Save.
    const invalid = missingRequiredFields(
      signupTypeDef.key,
      cleaned,
      "credentials"
    );
    setSignupFieldErrors(invalid);

    if (Object.keys(invalid).length > 0) {
      toast.error("Some details are still needed before this can be saved.");
      return;
    }

    setSavingSignupFields(true);

    const roleKeys = roleKeysFor(signupTypeDef.key);

    // UPDATE, then INSERT only where nothing was there. NOT upsert, and that is
    // not a style preference — upsert is refused for this table. PostgREST
    // compiles it to ON CONFLICT DO UPDATE SET over every column in the
    // payload, including profile_id and role_key, and 20260909120000 revoked
    // UPDATE from `authenticated` and granted back only `fields`. The result is
    // a flat "permission denied for table role_credentials" that says nothing
    // about which column caused it. Plain INSERT and a fields-only UPDATE are
    // both within the grants.
    //
    // (The onboarding route upserts the same table and is fine: it holds
    // service_role, which is not subject to any of this.)
    //
    // An account can legitimately have no row yet — nothing was filled in at
    // signup, since every field is optional — which is why the INSERT branch
    // has to exist at all.
    for (const key of roleKeys) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("role_credentials")
        .update({ fields: cleaned })
        .eq("profile_id", user.id)
        .eq("role_key", key)
        .select("role_key");

      if (updateError) {
        setSavingSignupFields(false);
        toast.error(updateError.message);
        return;
      }

      if ((updatedRows ?? []).length === 0) {
        // verified is deliberately not sent: the column defaults to false, and
        // naming it here would trip the INSERT guard for no reason.
        const { error: insertError } = await supabase
          .from("role_credentials")
          .insert({ profile_id: user.id, role_key: key, fields: cleaned });

        if (insertError) {
          setSavingSignupFields(false);
          toast.error(insertError.message);
          return;
        }
      }
    }

    // Merged, not replaced: metadata carries keys this form does not own —
    // full_name, contact_number, role, signup_type, account_type, roles — and
    // updateUser replaces `signup_fields` wholesale with whatever is passed.
    const { error: metaError } = await supabase.auth.updateUser({
      data: { signup_fields: cleaned },
    });

    setSavingSignupFields(false);

    if (metaError) {
      toast.error(metaError.message);
      return;
    }

    // Saving a licence number re-runs the CSLB check in the database, and a
    // number already verified on somebody else's account queues a security
    // alert to them. Flush it now rather than leaving it for the scheduled
    // drain. Fire and forget; the cron is the guarantee.
    nudgeEmailQueue();

    const clearedVerification = credentialsVerified && signupFieldsChanged;

    setSignupFields(cleaned);
    setSavedSignupFields(cleaned);
    if (clearedVerification) setCredentialsVerified(false);

    toast.success(
      clearedVerification
        ? "Credentials updated. Verification has been cleared and will need reviewing again."
        : "Credentials updated."
    );
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }

    setUploadingResume(true);

    const { error, path } = await uploadResume(userId, file);

    if (error) {
      toast.error(error);
      setUploadingResume(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ resume_path: path })
      .eq("id", userId);

    setUploadingResume(false);

    if (dbError) {
      toast.error(dbError.message);
      return;
    }

    setResumePath(path);
    toast.success("Resume uploaded successfully.");
  }

  async function handleViewResume() {
    if (!resumePath) return;

    const { error, url } = await getResumeSignedUrl(resumePath);

    if (error || !url) {
      toast.error(error || "Could not open resume.");
      return;
    }

    window.open(url, "_blank");
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are accepted.");
      return;
    }

    setUploadingLogo(true);

    const { error, path } = await uploadLogo(userId, file);

    if (error || !path) {
      toast.error(error || "Upload failed.");
      setUploadingLogo(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ company_logo_path: path })
      .eq("id", userId);

    setUploadingLogo(false);

    if (dbError) {
      toast.error(dbError.message);
      return;
    }

    setCompanyLogoPath(path);
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are accepted.");
      return;
    }

    setUploadingBanner(true);

    const { error, path } = await uploadBanner(userId, file);

    if (error || !path) {
      toast.error(error || "Upload failed.");
      setUploadingBanner(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ company_banner_path: path })
      .eq("id", userId);

    setUploadingBanner(false);

    if (dbError) {
      toast.error(dbError.message);
      return;
    }

    setCompanyBannerPath(path);
  }

  async function handleEmployerDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingEmployerDoc(true);

    const { error, path } = await uploadEmployerDocument(userId, file);

    setUploadingEmployerDoc(false);

    if (error || !path) {
      toast.error(error || "Upload failed.");
      return;
    }

    setEmployerDocPath(path);
    setEmployerDocLabel(file.name);
    toast.success("Document uploaded. An admin will review it shortly.");
  }

  async function handleViewEmployerDoc() {
    if (!employerDocPath) return;

    const { error, url } = await getEmployerDocumentSignedUrl(employerDocPath);

    if (error || !url) {
      toast.error(error || "Could not open document.");
      return;
    }

    window.open(url, "_blank");
  }

  if (loading) {
    return <PageLoader message="Loading your profile" />;
  }

  // Driven off SIGNUP_TYPES rather than a list repeated here, so this section
  // always shows exactly the fields the signup form collects. An unrecognised
  // signup_type resolves to undefined and hides the section, which also covers
  // a junk value written into metadata by hand.
  const signupTypeDef = SIGNUP_TYPES.find((t) => t.key === signupTypeKey);

  /**
   * Has anything in this section actually changed?
   *
   * Compared per field against the values loaded, trimmed both sides, so
   * whitespace alone is not a change. Drives both the Save button's disabled
   * state and whether the verification warning is shown — a warning that
   * appears when nothing has been touched would train people to ignore it.
   */
  /**
   * The fields this section actually renders — everything except the ones
   * stored in a profiles column, which belong to the main form above.
   */
  const credentialFields = (signupTypeDef?.fields ?? []).filter(
    (field) => !field.profileColumn
  );

  const signupFieldsChanged = credentialFields.some(
    (field) =>
      (signupFields[field.key] ?? "").trim() !==
      (savedSignupFields[field.key] ?? "").trim()
  );

  return (
    <div>
      {/* Badges move to the right rail from xl. They are the one thing on this
          page you read rather than edit, so they are the natural rail content,
          and pulling them out stops the form from being interrupted halfway
          down by a read-only panel.

          railFirst={false}: below xl they stack UNDER the form. Above it they
          would push the thing you came here to do off a phone screen — the
          opposite of the sponsored rail, which belongs at the top. */}
      <PageWithRail
        label="Badges"
        heading={<PageHeading title="Edit Profile" />}
        measure="reading"
        // 672 = max-w-2xl, the width this form had before the rail existed.
        readingWidth={672}
        contentClassName="max-w-2xl mx-auto xl:mx-0"
        railFirst={false}
        rail={<BadgesSection />}
      >
      <div>
      <div className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Profile Number</label>
          <div className="w-full p-4 rounded bg-zinc-900 border border-zinc-700 text-white font-semibold">
            {profileNumber}
          </div>
        </div>

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
        />

        {/* Trade.
            A select over lib/trades.tsx, with "Other" revealing a text box so
            nothing a user already typed is lost — profiles.trade is free text
            with no constraint, and plenty of rows predate this list. The stored
            value is whatever is in `trade`, whichever control produced it. */}
        <div className="space-y-2">
          <select
            aria-label="Trade"
            value={isListedTrade(trade) || trade === "" ? trade : OTHER_TRADE}
            onChange={(e) => {
              // Switching TO Other clears the field so the text box starts
              // empty rather than holding the listed trade they just left.
              // Switching to a listed trade stores it directly.
              setTrade(e.target.value === OTHER_TRADE ? "" : e.target.value);
              setTradeIsOther(e.target.value === OTHER_TRADE);
            }}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          >
            <option value="">Select your trade</option>
            {TRADES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={OTHER_TRADE}>Other</option>
          </select>

          {showOtherTrade && (
            <input
              type="text"
              placeholder="Your trade"
              aria-label="Your trade"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
            />
          )}
        </div>

        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 h-40 text-white"
        />

        {/* Location.
            Same treatment as Trade above and for the same reason: a select over
            a shared list, with Other revealing a text box so nothing already
            stored is lost. profiles.location is free text with no constraint
            and most existing rows read "Los Angeles, CA", which listedCityFor()
            resolves to the Los Angeles option rather than pushing into Other. */}
        <LocationField
          id="profile-location"
          value={location}
          onChange={setLocation}
          className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          labelClassName="block text-sm text-gray-400 mb-2"
        />

        <div>
          <label
            htmlFor="profile-contact-number"
            className="block text-sm text-gray-400 mb-2"
          >
            Contact number
          </label>
          <input
            id="profile-contact-number"
            type="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          />
        </div>

        {/* Years of experience — a band, and this is the ONLY editor for it.
            It is the signup field that lives in a profiles column rather than
            in signup_fields (see profileColumn in lib/signupRoles.tsx), because
            it is printed on other people's screens. The credentials section
            below therefore skips it; two controls for one value is how the two
            get to disagree. */}
        <div>
          <label
            htmlFor="profile-years-experience"
            className="block text-sm text-gray-400 mb-2"
          >
            Years of experience
          </label>
          <select
            id="profile-years-experience"
            value={yearsExperience}
            onChange={(e) => {
              setYearsExperience(e.target.value);
              setProfileErrors({});
            }}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          >
            <option value="">Select a range</option>
            {EXPERIENCE_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
            {/* A value outside the list — hand-written, or from a band that has
                since been renamed — stays selectable instead of rendering as an
                empty select that silently clears it on the next save. */}
            {yearsExperience &&
              !(EXPERIENCE_BANDS as readonly string[]).includes(
                yearsExperience
              ) && <option value={yearsExperience}>{yearsExperience}</option>}
          </select>
          {profileErrors.years_experience && (
            <p className="text-xs text-rose-400 mt-1">
              {profileErrors.years_experience}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Union Status</label>
          <div className="flex flex-wrap gap-3 mb-2">
            <button
              type="button"
              onClick={() => setUnionStatus("union")}
              className={`px-5 py-3 rounded-lg font-semibold border transition ${
                unionStatus === "union"
                  ? "bg-transparent border-accent text-white"
                  : "bg-zinc-900 border-zinc-800 text-gray-400"
              }`}
            >
              Union
            </button>
            <button
              type="button"
              onClick={() => setUnionStatus("non_union")}
              className={`px-5 py-3 rounded-lg font-semibold border transition ${
                unionStatus === "non_union"
                  ? "bg-transparent border-accent text-white"
                  : "bg-zinc-900 border-zinc-800 text-gray-400"
              }`}
            >
              Non-Union
            </button>
          </div>
          {unionStatus && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Preview:</span>
              <UnionBadge status={unionStatus} verified={unionVerified} />
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            This is self-reported. An admin will verify it before it shows as confirmed.
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Resume (PDF only)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleResumeUpload}
            disabled={uploadingResume}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
          />
          {uploadingResume && <InlineLoader message="Uploading resume" />}
          {resumePath && !uploadingResume && (
            <button
              onClick={handleViewResume}
              className="mt-3 text-accent-2-soft hover:text-white text-sm font-semibold"
            >
              View current resume →
            </button>
          )}
        </div>

        {/* Hidden entirely for accounts created before the current signup
            form — they have no signup_type, so there is nothing to show. */}
        {signupTypeDef && (
          <div className="border-t border-zinc-800 pt-6 mt-2">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">Signup details</h2>
              <span className="text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-gray-300">
                {signupTypeDef.label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              What you entered at signup. Update them as things change — the
              ones marked optional can be left empty.
            </p>

            {/* The account type itself is NOT editable here, and that is
                deliberate rather than unfinished. profiles_guard_signup_type
                raises 42501 for any non-admin caller, because the label is what
                marks someone as a licensed contractor and it must not be
                self-assignable. Shown as a badge above; changing it is an admin
                action. */}

            {/* Driven entirely off the field definition — type, options,
                required-ness and the message shown when a required one is
                empty all come from lib/signupRoles.tsx, exactly as they do on
                the signup form. Two renderers for one definition is how the
                two ends drift. */}
            <div className="space-y-4">
              {credentialFields.map((field) => {
                const value = signupFields[field.key] ?? "";
                const inputClass =
                  "w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white";

                const onChange = (next: string) => {
                  setSignupFields((prev) => ({ ...prev, [field.key]: next }));

                  setSignupFieldErrors((prev) => {
                    if (!prev[field.key]) return prev;

                    const cleared = { ...prev };
                    delete cleared[field.key];
                    return cleared;
                  });
                };

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
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClass}
                      />
                    ) : field.type === "select" ? (
                      <select
                        id={`signup-${field.key}`}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select one</option>
                        {(field.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                        {/* A stored value that is no longer in the list —
                            renamed, or written before the list existed — would
                            otherwise render as a blank select and be silently
                            replaced on the next save. */}
                        {value && !(field.options ?? []).includes(value) && (
                          <option value={value}>{value}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        id={`signup-${field.key}`}
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={inputClass}
                      />
                    )}

                    {field.hint && (
                      <p className="text-xs text-gray-500 mt-1">{field.hint}</p>
                    )}
                    {signupFieldErrors[field.key] && (
                      <p className="text-xs text-rose-400 mt-1">
                        {signupFieldErrors[field.key]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* BEFORE SAVING, NOT AFTER.
                Someone who went through verification should find out that
                editing costs it while they can still back out, not in a
                confirmation once it is gone. Rendered at full contrast with the
                warning treatment used elsewhere, not as a muted hint — it is
                the most consequential thing on this page.

                Only shown when it is actually true: they are verified AND
                something has changed. A permanent notice would be wallpaper. */}
            {credentialsVerified && signupFieldsChanged && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-rose-900 bg-rose-950/40 p-4"
              >
                <p className="text-sm font-semibold text-rose-300">
                  Saving will remove your verified status
                </p>
                <p className="text-sm text-gray-300 mt-1.5">
                  Your credentials are currently verified. Because you have
                  changed them, they will go back to unverified and an
                  administrator will need to review them again. Your existing
                  verification badge will be removed until then.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveSignupFields}
              disabled={savingSignupFields || !signupFieldsChanged}
              className="mt-5 bg-accent text-on-accent px-5 py-3 rounded-lg font-semibold hover:bg-accent-hover transition disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-11"
            >
              <ButtonSpinner active={savingSignupFields} />
              {savingSignupFields
                ? "Saving..."
                : credentialsVerified && signupFieldsChanged
                ? "Save and clear verification"
                : "Save credentials"}
            </button>
          </div>
        )}

        <div className="border-t border-zinc-800 pt-6 mt-2">
          <SectionHeading>Company Branding</SectionHeading>

          <div className="mb-5">
            {/* "Profile photo" first, because for an individual account that
                is what this is — company_logo_path is the round image rendered
                beside the name on the public profile, the marketplace card and
                the application card, and there is no other image column. The
                completion banner asks for a "profile photo"; a page whose only
                matching label said "Company Logo" would send an electrician
                looking for a field that, to them, does not exist. */}
            <label className="block text-sm text-gray-400 mb-2">
              Profile photo <span className="text-gray-500">/ company logo</span>
            </label>
            {companyLogoPath && (
              <img
                src={getBrandingPublicUrl(companyLogoPath)}
                alt="Company logo preview"
                className="w-20 h-20 rounded-full object-cover border border-zinc-700 mb-3"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploadingLogo}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingLogo && <InlineLoader message="Uploading logo" />}
          </div>

          <div className="mb-5">
            <label className="block text-sm text-gray-400 mb-2">Company Banner</label>
            {companyBannerPath && (
              <img
                src={getBrandingPublicUrl(companyBannerPath)}
                alt="Company banner preview"
                className="w-full h-32 rounded object-cover border border-zinc-700 mb-3"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleBannerUpload}
              disabled={uploadingBanner}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingBanner && <InlineLoader message="Uploading banner" />}
          </div>

          <textarea
            placeholder="Company Description"
            value={companyDescription}
            onChange={(e) => setCompanyDescription(e.target.value)}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 h-32 text-white mb-5"
          />

          <input
            type="text"
            placeholder="Company Website (e.g. yourcompany.com)"
            value={companyWebsite}
            onChange={(e) => setCompanyWebsite(e.target.value)}
            className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white"
          />

          <div className="mt-5">
            <label className="block text-sm text-gray-400 mb-2">
              Verification Document{" "}
              {employerVerified && <span className="text-green-400">(Verified ✓)</span>}
            </label>
            <input
              type="file"
              onChange={handleEmployerDocUpload}
              disabled={uploadingEmployerDoc}
              className="w-full p-4 rounded bg-zinc-900 border border-zinc-800 text-white disabled:opacity-50"
            />
            {uploadingEmployerDoc && <InlineLoader message="Uploading document" />}
            {employerDocPath && !uploadingEmployerDoc && (
              <button
                onClick={handleViewEmployerDoc}
                className="mt-3 text-accent-2-soft hover:text-white text-sm font-semibold"
              >
                View uploaded document: {employerDocLabel} →
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-accent text-on-accent px-6 py-4 rounded font-semibold"
        >
          Save Profile
        </button>
      </div>

      {/* Outside the Save Profile block on purpose: it writes to auth, not to
          the profiles row, and has its own submit. */}
      <ChangePasswordSection />

      <div className="mt-10 border-t border-zinc-800 pt-8">
        <SectionHeading
          actions={<ReviewSummary averageRating={averageRating} count={count} />}
        >
          Your Reputation
        </SectionHeading>

        {(hiredCount > 0 || jobsLandedCount > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {hiredCount > 0 && (
              <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
                {hiredCount} {hiredCount === 1 ? "person" : "people"} hired
              </span>
            )}
            {jobsLandedCount > 0 && (
              <span className="bg-zinc-800 text-gray-300 px-3 py-1 rounded-full text-sm">
                {jobsLandedCount} {jobsLandedCount === 1 ? "job" : "jobs"} landed
              </span>
            )}
          </div>
        )}

        <ReviewsList reviews={reviews} />
      </div>
      </div>
      </PageWithRail>
    </div>
  );
}