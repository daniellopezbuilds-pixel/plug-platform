"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageHeading } from "@/components/layout/PageHeading";
import { RailColumns, useRailBreakpoints } from "@/components/layout/RailColumns";
import { JobCard } from "@/components/jobs/JobCard";
import type { Job } from "@/hooks/useJobs";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { LocationField } from "@/components/ui/LocationField";
import { Icon } from "@/components/ui/Icon";
import {
  CheckboxTile,
  ChoiceGroup,
  FIELD_CONTROL,
  FIELD_LABEL,
  Field,
  FieldRow,
  FormSection,
  errorIdFor,
} from "@/components/ui/Form";
import {
  JOB_CLASSIFICATIONS,
  JOB_DURATIONS,
  JOB_EXPERIENCE_BANDS,
  JOB_SHIFTS,
  PAY_UNITS,
  WORK_TYPES,
  formatPay,
  jobDraftErrors,
} from "@/lib/jobs";

/**
 * Post a job.
 *
 * WHAT THIS REPLACED: five text boxes — title, company, location, pay,
 * description — and a union toggle. `pay` and `location` were free text, and
 * nothing asked what classification the work needed, whether it was
 * residential or industrial, when it started, or what shift it was. An
 * electrician could not judge a listing without applying to it.
 *
 * FOUR SECTIONS, each its own card, because the questions genuinely group that
 * way and a fourteen-field flat form does not get finished. Not a wizard: a
 * job post is a single decision and paging it would turn one submit into four.
 * Within a section, fields that are answered together sit together — start,
 * duration and shift on one row, the two ends of a pay range side by side —
 * and every row collapses to one column on a phone.
 *
 * SMALL FIXED SETS ARE TILES, NOT SELECTS. Work type, pay unit and union
 * status each have two to four options; a select hides them behind a tap and
 * a native picker, where tiles show every choice at once and are a thumb-sized
 * target each. Classification (seven) and the optional selects stay selects.
 *
 * UNION STATUS HAS AN EXPLICIT "Any". It used to be two toggle
 * buttons where un-requiring meant clicking the selected one again, with a
 * line of copy explaining that; a third option says it without the copy.
 * Stored exactly as before — null, 'union' or 'non_union'.
 *
 * SIX REQUIRED FIELDS: title, classification, work type, location, pay rate
 * and unit, description. The rule lives in jobDraftErrors() in lib/jobs.tsx,
 * not here, so the form and anything that later posts a job server-side agree.
 *
 * VALIDATION IS PER FIELD AND ON SUBMIT, not on blur. On a failed submit focus
 * moves to the first field with a problem, because the button is at the
 * bottom of a long form and the first problem is usually a screen above it.
 */

/** Where focus goes for each field jobDraftErrors can name, in form order. */
const FOCUS_TARGETS: [field: string, selector: string][] = [
  ["title", "#job-title"],
  ["classification", "#job-classification"],
  ["work_type", 'input[name="job-work-type"]'],
  ["description", "#job-description"],
  ["location", "#job-location"],
  ["pay_rate_min", "#job-pay-min"],
  ["pay_rate_max", "#job-pay-max"],
  ["pay_unit", 'input[name="job-pay-unit"]'],
];

/** ChoiceGroup needs a string for "none"; the column stores null. */
const NO_UNION_REQUIREMENT = "none";

const UNION_OPTIONS = [
  { value: NO_UNION_REQUIREMENT, label: "Any" },
  { value: "union", label: "Union" },
  { value: "non_union", label: "Non-union" },
] as const;

export default function CreateJobPage() {
  const router = useRouter();
  const { withRail } = useRailBreakpoints();

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [classification, setClassification] = useState("");
  const [workType, setWorkType] = useState("");
  const [description, setDescription] = useState("");

  const [location, setLocation] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [duration, setDuration] = useState("");
  const [shift, setShift] = useState("");

  const [payRateMin, setPayRateMin] = useState("");
  const [payRateMax, setPayRateMax] = useState("");
  const [payUnit, setPayUnit] = useState("hour");

  const [minYearsExperience, setMinYearsExperience] = useState("");
  const [certificationRequired, setCertificationRequired] = useState("");
  const [requiresOwnTools, setRequiresOwnTools] = useState(false);
  const [requiresOwnTransport, setRequiresOwnTransport] = useState(false);

  const [requiredUnionStatus, setRequiredUnionStatus] = useState<string | null>(
    null
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Clears one field's message as it is corrected, and leaves the rest. */
  function clearError(field: string) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  /** aria wiring for a control that can carry a field error. */
  function invalidProps(field: string, id: string) {
    return errors[field]
      ? { "aria-invalid": true as const, "aria-describedby": errorIdFor(id) }
      : {};
  }

  /**
   * What the pay line will read on the board, once the rate is a number.
   * Shown as the employer types so a range entered backwards, or a day rate
   * left on "per hour", is obvious before it is posted.
   */
  const payPreview = /^\d+(\.\d{1,2})?$/.test(payRateMin.trim())
    ? formatPay({
        pay_rate_min: payRateMin.trim(),
        pay_rate_max: /^\d+(\.\d{1,2})?$/.test(payRateMax.trim())
          ? payRateMax.trim()
          : null,
        pay_unit: payUnit,
      })
    : null;

  async function handleSubmit() {
    const draft = {
      title,
      classification,
      work_type: workType,
      location,
      pay_rate_min: payRateMin,
      pay_rate_max: payRateMax,
      pay_unit: payUnit,
      description,
    };

    const found = jobDraftErrors(draft);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      setError("Some details are still needed before this can be posted.");

      const first = FOCUS_TARGETS.find(([field]) => found[field]);
      if (first) {
        const el = document.querySelector<HTMLElement>(first[1]);
        el?.focus();
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    setSubmitting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("jobs").insert([
      {
        user_id: user.id,
        title: title.trim(),
        company: company.trim() || null,
        classification,
        work_type: workType,
        location: location.trim(),
        description: description.trim(),

        // Empty select to NULL rather than "", so `is null` keeps meaning
        // "not answered" and the CHECK constraints are not handed a blank
        // string to reject.
        starts_on: startsOn || null,
        duration: duration || null,
        shift: shift || null,

        pay_rate_min: Number(payRateMin),
        // NULL, not a copy of the minimum — that is what distinguishes a
        // single rate from a range of zero width. See the column comment.
        pay_rate_max: payRateMax.trim() ? Number(payRateMax) : null,
        pay_unit: payUnit,

        min_years_experience: minYearsExperience || null,
        certification_required: certificationRequired.trim() || null,
        requires_own_tools: requiresOwnTools,
        requires_own_transport: requiresOwnTransport,

        required_union_status: requiredUnionStatus,

        // `pay` is deliberately NOT written. It is the legacy free-text column
        // kept for the seven rows that predate the structured ones; writing a
        // rendered copy of the numbers into it would create a second source of
        // truth that goes stale the first time a rate is edited.
      },
    ]);

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/jobs");
  }

  /**
   * The job as the board will show it, built from the form as it stands.
   * A rate only reaches the preview once it parses as a number, which is
   * also the only way it could be posted.
   */
  const rateOk = (v: string) => /^d+(.d{1,2})?$/.test(v.trim());
  const previewJob: Job = {
    id: "preview",
    user_id: "",
    title: title.trim() || "Your job title",
    company: company.trim() || null,
    location: location.trim() || null,
    description: description.trim() || null,
    created_at: new Date().toISOString(),
    required_union_status: requiredUnionStatus,
    pay: null,
    classification: classification || null,
    work_type: workType || null,
    starts_on: startsOn || null,
    duration: duration || null,
    shift: shift || null,
    pay_rate_min: rateOk(payRateMin) ? payRateMin.trim() : null,
    pay_rate_max: rateOk(payRateMax) ? payRateMax.trim() : null,
    pay_unit: payUnit,
    min_years_experience: minYearsExperience || null,
    certification_required: certificationRequired.trim() || null,
    requires_own_tools: requiresOwnTools,
    requires_own_transport: requiresOwnTransport,
  };

  const checklist = [
    { done: !!title.trim() && !!classification && !!workType, label: "Title, classification and work type", required: true },
    { done: rateOk(payRateMin), label: "A pay rate", required: true },
    { done: !!location.trim(), label: "Where the work is", required: true },
    { done: description.trim().length >= 120, label: "A description of a few sentences", required: true },
    { done: !!startsOn, label: "A start date" },
    { done: !!shift || !!duration, label: "Shift or duration" },
  ];

  return (
    <RailColumns
      withRail={withRail}
      split={false}
      // A form reads badly past ~880px — labels drift from their fields. The
      // preview rail takes the rest of the width.
      mainMax={880}
      rightLabel="Preview"
      right={<PostJobPreview job={previewJob} checklist={checklist} />}
    >
      <PageHeading
        title="Post a Job"
        size="compact"
        subtitle="The more of this you fill in, the better an electrician can judge the job before applying."
      />

      <div className="space-y-4">
        <FormSection
          step={1}
          title="The work"
          description="What the job is and who it needs."
        >
          <Field label="Job title" htmlFor="job-title" error={errors.title}>
            <input
              id="job-title"
              type="text"
              placeholder="e.g. Journeyman Electrician — Tenant Improvement"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearError("title");
              }}
              disabled={submitting}
              className={FIELD_CONTROL}
              {...invalidProps("title", "job-title")}
            />
          </Field>

          <FieldRow>
            <Field label="Company" htmlFor="job-company" optional>
              <input
                id="job-company"
                type="text"
                placeholder="Who the work is for"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={submitting}
                className={FIELD_CONTROL}
              />
            </Field>

            <Field
              label="Classification needed"
              htmlFor="job-classification"
              error={errors.classification}
            >
              <select
                id="job-classification"
                value={classification}
                onChange={(e) => {
                  setClassification(e.target.value);
                  clearError("classification");
                }}
                disabled={submitting}
                className={FIELD_CONTROL}
                {...invalidProps("classification", "job-classification")}
              >
                <option value="">Select a classification</option>
                {JOB_CLASSIFICATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </FieldRow>

          <ChoiceGroup
            name="job-work-type"
            legend="Work type"
            columns={4}
            options={WORK_TYPES.map((o) => ({ value: o.key, label: o.label }))}
            value={workType}
            onChange={(next) => {
              setWorkType(next);
              clearError("work_type");
            }}
            disabled={submitting}
            error={errors.work_type}
          />

          <Field
            label="Description"
            htmlFor="job-description"
            error={errors.description}
            hint="The scope, the site, what a day looks like — anything an electrician should know before applying."
          >
            <textarea
              id="job-description"
              placeholder="Describe the work"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError("description");
              }}
              disabled={submitting}
              rows={7}
              className={`${FIELD_CONTROL} min-h-40 resize-y leading-relaxed`}
              {...invalidProps("description", "job-description")}
            />
          </Field>
        </FormSection>

        <FormSection
          step={2}
          title="Where and when"
          description="Only the city is required — a job with no stated start is still a readable job."
        >
          {/* The same control the profile editor and signup use, so a job's
              city and a worker's city are the same vocabulary and can be
              matched later. It opens its free-text box for anything outside
              the list, which is also how the seven legacy rows' locations
              stay editable. */}
          <LocationField
            id="job-location"
            value={location}
            onChange={(next) => {
              setLocation(next);
              clearError("location");
            }}
            className={FIELD_CONTROL}
            labelClassName={FIELD_LABEL}
            error={errors.location}
          />

          <FieldRow cols={3}>
            <Field label="Start date" htmlFor="job-starts-on" optional>
              <input
                id="job-starts-on"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                disabled={submitting}
                // appearance-none: iOS gives a date input an intrinsic width
                // and centres its value, so without it the control sits
                // narrower than its neighbours with the date floating mid-box.
                className={`${FIELD_CONTROL} appearance-none text-left`}
              />
            </Field>

            <Field label="Duration" htmlFor="job-duration" optional>
              <select
                id="job-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={submitting}
                className={FIELD_CONTROL}
              >
                <option value="">Not specified</option>
                {JOB_DURATIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Shift" htmlFor="job-shift" optional>
              <select
                id="job-shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                disabled={submitting}
                className={FIELD_CONTROL}
              >
                <option value="">Not specified</option>
                {JOB_SHIFTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </FieldRow>
        </FormSection>

        <FormSection
          step={3}
          title="Pay"
          description="A single rate, or a range. This is the first thing most people look at."
        >
          {/* Two-up even on a phone: they are the two ends of one range and
              read as a pair. 150px each at 375 is plenty for a rate. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <Field label="Rate" htmlFor="job-pay-min" error={errors.pay_rate_min}>
              <MoneyInput
                id="job-pay-min"
                placeholder="45"
                value={payRateMin}
                onChange={(next) => {
                  setPayRateMin(next);
                  clearError("pay_rate_min");
                }}
                disabled={submitting}
                invalid={invalidProps("pay_rate_min", "job-pay-min")}
              />
            </Field>

            <Field
              label="Up to"
              htmlFor="job-pay-max"
              optional
              error={errors.pay_rate_max}
            >
              <MoneyInput
                id="job-pay-max"
                placeholder="55"
                value={payRateMax}
                onChange={(next) => {
                  setPayRateMax(next);
                  clearError("pay_rate_max");
                }}
                disabled={submitting}
                invalid={invalidProps("pay_rate_max", "job-pay-max")}
              />
            </Field>
          </div>

          <ChoiceGroup
            name="job-pay-unit"
            legend="Paid"
            options={PAY_UNITS.map((o) => ({ value: o.key, label: o.label }))}
            value={payUnit}
            onChange={(next) => {
              setPayUnit(next);
              clearError("pay_unit");
            }}
            disabled={submitting}
            error={errors.pay_unit}
          />

          <div className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-400">Shows on the board as</p>
            <p
              className={`font-semibold ${
                payPreview ? "text-accent text-lg" : "text-gray-500 text-sm"
              }`}
              aria-live="polite"
            >
              {payPreview ?? "Enter a rate to preview"}
            </p>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Leave <span className="font-semibold text-gray-400">Up to</span>{" "}
            empty for a single rate. Numbers only — the currency and the unit
            are added for you.
          </p>
        </FormSection>

        <FormSection
          step={4}
          title="Requirements"
          description="All optional. Leave anything you do not insist on empty rather than guessing."
        >
          <FieldRow>
            <Field label="Minimum experience" htmlFor="job-min-experience" optional>
              <select
                id="job-min-experience"
                value={minYearsExperience}
                onChange={(e) => setMinYearsExperience(e.target.value)}
                disabled={submitting}
                className={FIELD_CONTROL}
              >
                <option value="">No minimum</option>
                {JOB_EXPERIENCE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Certification required" htmlFor="job-certification" optional>
              <input
                id="job-certification"
                type="text"
                placeholder="e.g. OSHA 30, fire alarm"
                value={certificationRequired}
                onChange={(e) => setCertificationRequired(e.target.value)}
                disabled={submitting}
                className={FIELD_CONTROL}
              />
            </Field>
          </FieldRow>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CheckboxTile
              checked={requiresOwnTools}
              onChange={setRequiresOwnTools}
              disabled={submitting}
              label="Must have own tools"
              description="Hand tools and meters brought to site."
            />
            <CheckboxTile
              checked={requiresOwnTransport}
              onChange={setRequiresOwnTransport}
              disabled={submitting}
              label="Must have own transport"
              description="Getting to and between sites."
            />
          </div>

          <ChoiceGroup
            name="job-union-status"
            legend="Union status"
            columns={3}
            options={UNION_OPTIONS}
            value={requiredUnionStatus ?? NO_UNION_REQUIREMENT}
            onChange={(next) =>
              setRequiredUnionStatus(next === NO_UNION_REQUIREMENT ? null : next)
            }
            disabled={submitting}
          />
        </FormSection>

        {/* SUBMIT. The error sits here, beside the button, rather than at the
            top of the form: the button is where the person is looking when
            it appears, and the top is a long scroll away on a phone. */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-4 sm:px-6">
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-lg border border-rose-900 bg-rose-950/60 p-3 text-sm text-rose-300"
            >
              <Icon name="exclamation" className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-400">
              Your job appears on the Jobs Board as soon as it is posted.
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <ButtonSpinner active={submitting} />
              {submitting ? "Posting..." : "Post job"}
            </button>
          </div>
        </div>
      </div>
    </RailColumns>
  );
}

/**
 * The board card, live, beside the form — borrowed from Indeed's post-a-job
 * preview. An employer otherwise cannot see what an electrician sees until
 * after posting, and a missing rate or a vague title is obvious in the card
 * in a way it is not in a form field.
 *
 * `inert`: it is the real JobCard, button and all, and none of it should be
 * clickable or focusable here.
 *
 * The checklist is what the board needs to be judged on, not a score. The
 * first four are what jobDraftErrors() requires (plus a description long
 * enough to be useful); the last two are optional and marked as such.
 */
function PostJobPreview({
  job,
  checklist,
}: {
  job: Job;
  checklist: { done: boolean; label: string; required?: boolean }[];
}) {
  return (
    <>
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          On the Jobs Board
        </p>
        <div inert>
          <JobCard job={job} hasApplied={false} onViewDetails={() => {}} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950">
        <header className="border-b border-zinc-800 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-white">What electricians look for</h2>
        </header>
        <ul className="space-y-2 px-4 py-3">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  item.done ? "border-accent bg-accent text-on-accent" : "border-zinc-600"
                }`}
              >
                {item.done && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={item.done ? "text-gray-300" : "text-gray-400"}>
                {item.label}
                {!item.required && <span className="text-gray-600"> · optional</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** A rate input with a fixed "$" in front, so nobody types one. */
function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  disabled: boolean;
  invalid: Record<string, unknown>;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-gray-500"
      >
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${FIELD_CONTROL} pl-8`}
        {...invalid}
      />
    </div>
  );
}
