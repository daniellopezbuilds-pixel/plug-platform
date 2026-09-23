"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { UnionBadge } from "@/components/ui/UnionBadge";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { ReviewsList } from "@/components/reviews/ReviewsList";
import {
  uploadResume,
  getResumeSignedUrl,
  validateResume,
  RESUME_ACCEPT,
} from "@/lib/resume";
import { uploadLogo, uploadBanner, getBrandingPublicUrl } from "@/lib/branding";
import { uploadEmployerDocument, getEmployerDocumentSignedUrl } from "@/lib/employerDocuments";
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection";
import { BadgesSection } from "@/components/profile/BadgesSection";
import { LicenceVerificationStatus } from "@/components/profile/LicenceVerificationStatus";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { Tabs, tabPanelId, type TabDef } from "@/components/ui/Tabs";
import { useReviews } from "@/hooks/useReviews";
import { useProfileStats } from "@/hooks/useProfileStats";
import {
  SIGNUP_TYPES,
  EXPERIENCE_BANDS,
  ELECTRICIAN_CLASSIFICATIONS,
  applyFieldAliases,
  fieldErrors,
  roleKeysFor,
} from "@/lib/signupRoles";
import { PageLoader } from "@/components/ui/Loading";
import { InlineLoader } from "@/components/ui/Loading";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { useToast } from "@/components/ui/Toast";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { TRADES, OTHER_TRADE, isListedTrade } from "@/lib/trades";
import { nudgeEmailQueue } from "@/lib/emailOutbox";
import { LocationField } from "@/components/ui/LocationField";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { ProfileSummaryCard } from "@/components/feed/FeedRail";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import {
  ChoiceGroup,
  FIELD_CONTROL,
  FIELD_LABEL,
  Field,
  FieldRow,
  FormSection,
} from "@/components/ui/Form";

/** File inputs: the native button styled to match, full width, 48px tall. */
const FILE_CONTROL =
  "block min-h-12 w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-sm text-gray-300 transition focus:border-accent focus:outline-none disabled:opacity-50 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-zinc-700";

const UNION_OPTIONS = [
  { value: "union", label: "Union" },
  { value: "non_union", label: "Non-union" },
] as const;

/**
 * The four tabs, in order.
 *
 * WHY THIS PAGE IS TABBED AT ALL. It was one column roughly two thousand
 * pixels tall: identity, trade, union, resume, signup credentials, company
 * branding, a Save button, a password form and a reviews list, in that order.
 * Editing your bio meant scrolling past your licence number, and the page had
 * three separate Save buttons at three separate depths with nothing saying
 * which one owned which field.
 *
 * THE SPLIT IS BY WHO SAVES IT. Each tab maps onto exactly one writer:
 *
 *   profile      -> handleSave(), the profiles row
 *   credentials  -> handleSaveSignupFields(), role_credentials + auth metadata
 *   badges       -> nothing. Read-only; badges are awarded, not edited
 *   security     -> ChangePasswordSection, which writes to auth
 *
 * That is why "years of experience" is on Profile and not on Credentials even
 * though signup asks it among the credential questions: it is stored in a
 * profiles column, so the Profile tab's Save is the one that writes it. See
 * profileColumn in lib/signupRoles.tsx.
 */
const PROFILE_TABS = [
  { key: "profile", label: "Profile" },
  { key: "credentials", label: "Credentials" },
  { key: "badges", label: "Badges" },
  { key: "security", label: "Security" },
] as const;

type ProfileTab = (typeof PROFILE_TABS)[number]["key"];

function isProfileTab(value: string | null): value is ProfileTab {
  return !!value && PROFILE_TABS.some((t) => t.key === value);
}

/**
 * useSearchParams() forces the tree up to the nearest Suspense boundary to be
 * client-rendered, and a static route that calls it WITHOUT one fails the
 * production build outright — not dev, where routes render on demand and the
 * problem stays invisible. See
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md.
 *
 * Nothing is lost by the boundary here: this page is "use client" and fetches
 * everything it shows after mount, so there was never any prerendered content
 * to protect.
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProfileEditor />
    </Suspense>
  );
}

function ProfileEditor() {
  const toast = useToast();
  const confirm = useConfirm();
  const { withRail } = useRailBreakpoints();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");

  const [profileNumber, setProfileNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [trade, setTrade] = useState("");
  const [classification, setClassification] = useState("");

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
   * Validity is decided by fieldErrors() — the same function the signup form
   * and the onboarding route use — so an account cannot be edited into a state
   * signup would have refused to create, and a licence number rejected at
   * signup cannot be saved here instead.
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
      setClassification(profile.classification || "");
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
      ? fieldErrors(
          signupTypeDef.key,
          { years_experience: yearsExperience, classification },
          "columns"
        )
      : {};

    setProfileErrors(invalidColumns);

    if (Object.keys(invalidColumns).length > 0) {
      // Names the tab. Each tab saves only its own fields, so "some details"
      // with no location would send somebody hunting across four of them.
      toast.error("Check the highlighted fields on Profile before saving.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username,
        trade,
        // profiles.classification since 20260922190000. Saved by THIS tab, not
        // the credentials form, because it is a column — same split as
        // years_experience. See profileColumn in lib/signupRoles.tsx.
        classification: classification || null,
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
      toast.error(`Could not save your profile: ${error.message}`);
      return;
    }

    setUnionVerified(false);
    toast.success("Profile saved.");
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

    // The one save on this page that loses something: editing verified
    // credentials sends them back to unverified. The warning above the button
    // says so; this makes it a decision rather than a click.
    if (credentialsVerified && signupFieldsChanged) {
      const ok = await confirm({
        title: "Save and remove your verified status?",
        body: "Your credentials go back to unverified and your verification badge is removed until an administrator reviews them again.",
        confirmLabel: "Save and clear verification",
      });
      if (!ok) return;
    }

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
    const invalid = fieldErrors(
      signupTypeDef.key,
      cleaned,
      "credentials"
    );
    setSignupFieldErrors(invalid);

    if (Object.keys(invalid).length > 0) {
      // fieldErrors() now reports bad formats as well as blanks, so this can no
      // longer say "still needed" — a licence number with letters in it is not
      // missing, it is wrong, and the per-field message below says which.
      toast.error("Check the highlighted fields on Credentials before saving.");
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
        toast.error(`Could not save your credentials: ${updateError.message}`);
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
          toast.error(`Could not save your credentials: ${insertError.message}`);
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
      toast.error(`Could not save your credentials: ${metaError.message}`);
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
        ? "Credentials saved. Verification has been cleared and will need reviewing again."
        : "Credentials saved."
    );
  }

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // The type and size rules live in lib/resume.tsx, with uploadResume()
    // re-checking them — a rule enforced only by the form that happens to call
    // it is not enforced.
    const invalid = validateResume(file);
    if (invalid) {
      toast.error(invalid);
      // Clear the input, or picking the SAME rejected file again fires no
      // change event and the form looks frozen.
      e.target.value = "";
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

  /**
   * Credentials is hidden for an account with no recognised signup_type —
   * there is nothing to put on it. Accounts predating the current signup form
   * are the case, and they are the same ones that saw no "Signup details"
   * section before this page had tabs.
   */
  const tabs: TabDef<ProfileTab>[] = PROFILE_TABS.filter(
    (tab) => tab.key !== "credentials" || !!signupTypeDef
  ).map((tab) => ({ key: tab.key, label: tab.label }));

  /**
   * THE URL IS THE STATE, not a copy of it kept in useState and synced.
   *
   * A notification links straight to ?tab=credentials, so the query string has
   * to be able to open a tab on first paint. Deriving the tab from it rather
   * than seeding state from it means there is no second source of truth to
   * drift, and Back works without anything listening for it.
   *
   * An unknown or unavailable tab falls back to Profile rather than rendering
   * nothing — ?tab=nonsense, or ?tab=credentials on an account that has none,
   * should look like a normal profile page.
   */
  const requested = searchParams.get("tab");
  const activeTab: ProfileTab =
    isProfileTab(requested) && tabs.some((t) => t.key === requested)
      ? requested
      : "profile";

  function selectTab(key: ProfileTab) {
    // replace, not push: a tab is a view of one page, and pushing would make
    // Back walk through every tab somebody clicked before leaving the page.
    // scroll: false because switching tabs should not jump to the top — the
    // strip is already at the top and the jump reads as a page load.
    router.replace(
      key === "profile" ? "/dashboard/profile" : `/dashboard/profile?tab=${key}`,
      { scroll: false }
    );
  }

  const reputation = (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">Reputation</h2>
        <ReviewSummary averageRating={averageRating} count={count} />
      </header>
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-zinc-800">
        <li className="bg-zinc-950 px-4 py-3">
          <span className="block text-2xl font-bold text-white">{hiredCount}</span>
          <span className="block text-xs text-gray-500">People hired</span>
        </li>
        <li className="bg-zinc-950 px-4 py-3">
          <span className="block text-2xl font-bold text-white">{jobsLandedCount}</span>
          <span className="block text-xs text-gray-500">Jobs landed</span>
        </li>
      </ul>
    </section>
  );

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      // A form past ~880px reads badly — labels drift from their fields. The
      // rail takes the rest of the width.
      mainMax={880}
      rightLabel="How others see you"
      right={
        <>
          <ProfileSummaryCard />
          {reputation}
        </>
      }
    >
      {/* YOUR OWN PROFILE, AS EVERYONE ELSE SEES IT, above the form that edits
          it. The page opened with "Edit Profile" in 48px and then a stack of
          inputs — which told you what the page was for and nothing about what
          it currently says. The same header the public page and the preview
          modal render means the effect of a change is visible where the change
          is made. */}
      <ProfileHeader
        profileId={userId || null}
        fullName={fullName}
        profileNumber={profileNumber}
        signupType={signupTypeKey}
        companyLogoPath={companyLogoPath}
        companyBannerPath={companyBannerPath}
        trade={trade}
        classification={classification || null}
        location={location}
        yearsExperience={yearsExperience}
        unionStatus={unionStatus}
        unionVerified={unionVerified}
      />

      <div className="mt-8">
        <Tabs tabs={tabs} active={activeTab} onChange={selectTab} />
      </div>

      {/* Panels are mounted only while selected. Every field on this page is
          bound to state held by THIS component, so nothing is lost by
          unmounting a panel — and the alternative, keeping them all in the DOM
          behind `hidden`, would run the badges query on every page load
          whether or not anybody opened that tab. */}
      {activeTab === "profile" && (
      <div
        id={tabPanelId("profile")}
        role="tabpanel"
        aria-labelledby="tab-profile"
      >
      {/* GROUPED, NOT ONE COLUMN OF FIFTEEN INPUTS. The fields were a single
          stack with placeholders standing in for labels — which vanish as
          soon as you type, so a filled-in form no longer said what anything
          was. They are now four labelled sections, related fields side by
          side, each collapsing to one column on a phone. */}
      <div className="space-y-4">
        <FormSection title="Photo and name" description="What people see beside everything you post, apply to or send.">
          <div className="flex items-center gap-4">
            <Avatar name={fullName} photoPath={companyLogoPath} size="lg" />
            {/* "Profile photo" first: for an individual account that is what
                this is — company_logo_path is the round image beside the name
                on every card, and there is no other image column. */}
            <Field
              label={<>Profile photo <span className="text-gray-500">/ company logo</span></>}
              htmlFor="profile-photo"
              className="flex-1"
            >
              <input
                id="profile-photo"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className={FILE_CONTROL}
              />
            </Field>
          </div>
          {uploadingLogo && <InlineLoader message="Uploading photo" />}

          <FieldRow cols={3}>
            <Field label="Full name" htmlFor="profile-full-name">
              <input
                id="profile-full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={FIELD_CONTROL}
              />
            </Field>
            <Field label="Username" htmlFor="profile-username">
              <input
                id="profile-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={FIELD_CONTROL}
              />
            </Field>
            <div className="min-w-0">
              <p className={FIELD_LABEL}>Profile number</p>
              <p className="font-technical flex min-h-12 items-center font-semibold text-white">
                {profileNumber}
              </p>
            </div>
          </FieldRow>
        </FormSection>

        <FormSection title="Trade and experience" description="How employers and other trades find and judge you.">
          <FieldRow cols={3}>
            {/* Trade: a select over lib/trades.tsx, with "Other" revealing a
                text box so nothing a user already typed is lost —
                profiles.trade is free text and plenty of rows predate the
                list. */}
            <Field label="Trade" htmlFor="profile-trade">
              <div className="space-y-2">
                <select
                  id="profile-trade"
                  value={isListedTrade(trade) || trade === "" ? trade : OTHER_TRADE}
                  onChange={(e) => {
                    // Switching TO Other clears the field so the text box
                    // starts empty rather than holding the trade just left.
                    setTrade(e.target.value === OTHER_TRADE ? "" : e.target.value);
                    setTradeIsOther(e.target.value === OTHER_TRADE);
                  }}
                  className={FIELD_CONTROL}
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
                    className={FIELD_CONTROL}
                  />
                )}
              </div>
            </Field>

            {/* Classification — how you are classified on the job, as opposed
                to trade, which is what kind of work you do. Shown for everyone:
                a C-10 who also works on the tools has one. */}
            <Field label="Classification" htmlFor="profile-classification" error={profileErrors.classification}>
              <select
                id="profile-classification"
                value={classification}
                onChange={(e) => {
                  setClassification(e.target.value);
                  setProfileErrors({});
                }}
                className={FIELD_CONTROL}
              >
                <option value="">Not specified</option>
                {ELECTRICIAN_CLASSIFICATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>

            {/* Years of experience — a band, and this is the ONLY editor for
                it: the signup field that lives in a profiles column, because it
                is printed on other people's screens. The credentials tab skips
                it; two controls for one value is how they disagree. */}
            <Field label="Years of experience" htmlFor="profile-years-experience" error={profileErrors.years_experience}>
              <select
                id="profile-years-experience"
                value={yearsExperience}
                onChange={(e) => {
                  setYearsExperience(e.target.value);
                  setProfileErrors({});
                }}
                className={FIELD_CONTROL}
              >
                <option value="">Select a range</option>
                {EXPERIENCE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
                {/* A value outside the list stays selectable instead of
                    rendering as an empty select that silently clears it on
                    the next save. */}
                {yearsExperience &&
                  !(EXPERIENCE_BANDS as readonly string[]).includes(yearsExperience) && (
                    <option value={yearsExperience}>{yearsExperience}</option>
                  )}
              </select>
            </Field>
          </FieldRow>

          <ChoiceGroup
            name="profile-union"
            legend="Union status"
            options={UNION_OPTIONS}
            value={(unionStatus ?? "") as "" | "union" | "non_union"}
            onChange={(next) => setUnionStatus(next)}
          />
          <p className="-mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            Self-reported — an admin verifies it before it shows as confirmed.
            {unionStatus && <UnionBadge status={unionStatus} verified={unionVerified} />}
          </p>

          <Field label="Résumé" htmlFor="profile-resume" hint="PDF or Word, under 5MB. Uploading a new one replaces the old.">
            <input
              id="profile-resume"
              type="file"
              accept={RESUME_ACCEPT}
              onChange={handleResumeUpload}
              disabled={uploadingResume}
              className={FILE_CONTROL}
            />
          </Field>
          {uploadingResume && <InlineLoader message="Uploading résumé" />}
          {resumePath && !uploadingResume && (
            <button
              type="button"
              onClick={handleViewResume}
              className="-mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-2-soft transition hover:text-white"
            >
              <Icon name="document" />
              View current résumé
            </button>
          )}
        </FormSection>

        <FormSection title="About and contact" description="Where you are, how to reach you, and a few lines about your work.">
          <Field label="Bio" htmlFor="profile-bio">
            <textarea
              id="profile-bio"
              placeholder="The work you do, where, and what you are looking for"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              className={`${FIELD_CONTROL} min-h-32 resize-y leading-relaxed`}
            />
          </Field>

          <FieldRow>
            {/* Same treatment as Trade: a select over a shared list, with
                Other revealing a text box so nothing already stored is lost. */}
            <LocationField
              id="profile-location"
              value={location}
              onChange={setLocation}
              className={FIELD_CONTROL}
              labelClassName={FIELD_LABEL}
            />

            <Field label="Contact number" htmlFor="profile-contact-number">
              <input
                id="profile-contact-number"
                type="tel"
                autoComplete="tel"
                placeholder="(555) 123-4567"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className={FIELD_CONTROL}
              />
            </Field>
          </FieldRow>
        </FormSection>

        <FormSection title="Company" description="For contractors and employers. Leave it empty if you work for someone else.">
          <Field label="Company banner" htmlFor="profile-banner">
            {companyBannerPath && (
              // eslint-disable-next-line @next/next/no-img-element -- public storage URL, as everywhere else branding renders
              <img
                src={getBrandingPublicUrl(companyBannerPath)}
                alt="Company banner preview"
                className="mb-3 h-28 w-full rounded-lg border border-zinc-800 object-cover"
              />
            )}
            <input
              id="profile-banner"
              type="file"
              accept="image/*"
              onChange={handleBannerUpload}
              disabled={uploadingBanner}
              className={FILE_CONTROL}
            />
          </Field>
          {uploadingBanner && <InlineLoader message="Uploading banner" />}

          <Field label="Company description" htmlFor="profile-company-description">
            <textarea
              id="profile-company-description"
              value={companyDescription}
              onChange={(e) => setCompanyDescription(e.target.value)}
              rows={4}
              className={`${FIELD_CONTROL} min-h-28 resize-y leading-relaxed`}
            />
          </Field>

          <FieldRow>
            <Field label="Company website" htmlFor="profile-company-website">
              <input
                id="profile-company-website"
                type="text"
                inputMode="url"
                placeholder="yourcompany.com"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                className={FIELD_CONTROL}
              />
            </Field>

            <Field
              label={
                <>
                  Verification document{" "}
                  {employerVerified && <span className="text-accent">(Verified ✓)</span>}
                </>
              }
              htmlFor="profile-employer-doc"
            >
              <input
                id="profile-employer-doc"
                type="file"
                onChange={handleEmployerDocUpload}
                disabled={uploadingEmployerDoc}
                className={FILE_CONTROL}
              />
            </Field>
          </FieldRow>
          {uploadingEmployerDoc && <InlineLoader message="Uploading document" />}
          {employerDocPath && !uploadingEmployerDoc && (
            <button
              type="button"
              onClick={handleViewEmployerDoc}
              className="-mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent-2-soft transition hover:text-white"
            >
              <Icon name="document" />
              View uploaded document: {employerDocLabel}
            </button>
          )}
        </FormSection>

        {/* STICKY SAVE. The button used to sit at the very end of a long
            form, so an edit near the top had to be followed by a scroll to
            the bottom to keep it. Pinned to the bottom of the scroll area it
            is always one tap away, and it sits above the content, not over
            the last field. */}
        <div className="sticky bottom-0 z-10 -mx-1 border-t border-zinc-800 bg-black/90 px-1 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="hidden text-sm text-gray-400 sm:block">
              Photo, résumé and documents save as soon as they upload.
            </p>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-6 font-semibold text-on-accent transition hover:bg-accent-hover sm:w-auto"
            >
              Save profile
            </button>
          </div>
        </div>
      </div>

        {/* Reviews under the form on this tab. The rating and hire counts
            are in the rail (or below here on a phone). */}
        <div className="mt-8">
          <SectionHeading actions={<ReviewSummary averageRating={averageRating} count={count} />}>
            Your reputation
          </SectionHeading>
          {!withRail && (hiredCount > 0 || jobsLandedCount > 0) && (
            <div className="mb-4 flex flex-wrap gap-2">
              {hiredCount > 0 && (
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-gray-300">
                  {hiredCount} {hiredCount === 1 ? "person" : "people"} hired
                </span>
              )}
              {jobsLandedCount > 0 && (
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-gray-300">
                  {jobsLandedCount} {jobsLandedCount === 1 ? "job" : "jobs"} landed
                </span>
              )}
            </div>
          )}
          <ReviewsList reviews={reviews} />
        </div>
      </div>
      )}

      {activeTab === "credentials" && (
        <div
          id={tabPanelId("credentials")}
          role="tabpanel"
          aria-labelledby="tab-credentials"
          className="space-y-5"
        >
          {/* WHERE THE LICENCE STANDS, ABOVE THE FIELD THAT DECIDES IT.
              A contractor arriving from a "licence not approved" notification
              lands here, and the first thing on the tab is why. */}
          <LicenceVerificationStatus />

          {/* No top rule any more: it was separating this from the main form
              when the two shared one column, and a horizontal line across the
              first thing on a tab reads as a heading that lost its text. */}
          {signupTypeDef && (
            <div>
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
                  const inputClass = FIELD_CONTROL;

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
                        className={FIELD_LABEL}
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
        </div>
      )}

      {activeTab === "badges" && (
        <div
          id={tabPanelId("badges")}
          role="tabpanel"
          aria-labelledby="tab-badges"
        >
          {/* No Save button, and there should not be one. Badges are awarded
              by the CSLB check and by administrators; there is nothing on this
              tab a user can set. */}
          <BadgesSection />
        </div>
      )}

      {activeTab === "security" && (
        <div
          id={tabPanelId("security")}
          role="tabpanel"
          aria-labelledby="tab-security"
        >
          {/* Its own form and its own submit: it writes to auth, not to the
              profiles row, and it re-authenticates before it does. */}
          <ChangePasswordSection />
        </div>
      )}
    </RailColumns>
  );
}