"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/layout/PageHeading";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { LocationField } from "@/components/ui/LocationField";
import {
  JOB_CLASSIFICATIONS,
  JOB_DURATIONS,
  JOB_EXPERIENCE_BANDS,
  JOB_SHIFTS,
  PAY_UNITS,
  WORK_TYPES,
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
 * FOUR SECTIONS, because the questions genuinely group that way and a
 * fourteen-field flat form does not get finished. Headings are `<h2>`s inside
 * one form rather than a wizard: a job post is a single decision and paging it
 * would turn one submit into four.
 *
 * SIX REQUIRED FIELDS: title, classification, work type, location, pay rate
 * and unit, description. Everything else is optional. The line is editorial —
 * a post with no pay, no city and no classification is unusable to the people
 * reading the board, and the fields left optional are ones whose absence still
 * leaves a readable job. The rule lives in jobDraftErrors() in lib/jobs.tsx,
 * not here, so the form and anything that later posts a job server-side agree.
 *
 * VALIDATION IS PER FIELD AND ON SUBMIT, not on blur. A message appearing
 * under a field the moment focus leaves it — while someone is tabbing through
 * to see what is being asked — reads as a telling-off for not having finished
 * yet.
 */

const INPUT =
  "w-full p-4 rounded bg-zinc-800 border border-zinc-700 text-white disabled:opacity-50";
const LABEL = "block text-sm text-gray-400 mb-2";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-rose-400 mt-1">{message}</p>;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-zinc-800 pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="text-xs text-gray-400 mt-1 mb-4">{hint}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function CreateJobPage() {
  const router = useRouter();

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

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeading
        title="Post a Job"
        subtitle="The more of this you fill in, the better an electrician can judge the job before applying."
      />

      <Card>
        <div className="space-y-8">
          {error && (
            <div
              role="alert"
              className="bg-rose-950 border border-rose-800 text-rose-300 rounded-lg p-3 text-sm"
            >
              {error}
            </div>
          )}

          <Section
            title="The work"
            hint="What the job is and who it needs."
          >
            <div>
              <label htmlFor="job-title" className={LABEL}>
                Job title
              </label>
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
                className={INPUT}
              />
              <FieldError message={errors.title} />
            </div>

            <div>
              <label htmlFor="job-company" className={LABEL}>
                Company <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="job-company"
                type="text"
                placeholder="Who the work is for"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={submitting}
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="job-classification" className={LABEL}>
                Classification needed
              </label>
              <select
                id="job-classification"
                value={classification}
                onChange={(e) => {
                  setClassification(e.target.value);
                  clearError("classification");
                }}
                disabled={submitting}
                className={INPUT}
              >
                <option value="">Select a classification</option>
                {JOB_CLASSIFICATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <FieldError message={errors.classification} />
            </div>

            <div>
              <label htmlFor="job-work-type" className={LABEL}>
                Work type
              </label>
              <select
                id="job-work-type"
                value={workType}
                onChange={(e) => {
                  setWorkType(e.target.value);
                  clearError("work_type");
                }}
                disabled={submitting}
                className={INPUT}
              >
                <option value="">Select a work type</option>
                {WORK_TYPES.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={errors.work_type} />
            </div>

            <div>
              <label htmlFor="job-description" className={LABEL}>
                Description
              </label>
              <textarea
                id="job-description"
                placeholder="The scope, the site, what a day looks like, anything an electrician should know before applying."
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearError("description");
                }}
                disabled={submitting}
                className={`${INPUT} h-40`}
              />
              <FieldError message={errors.description} />
            </div>
          </Section>

          <Section
            title="Where and when"
            hint="Only the city is required — a job with no stated start is still a readable job."
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
              className={INPUT}
              labelClassName={LABEL}
              error={errors.location}
            />

            <div>
              <label htmlFor="job-starts-on" className={LABEL}>
                Start date <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="job-starts-on"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                disabled={submitting}
                className={INPUT}
              />
            </div>

            <div>
              <label htmlFor="job-duration" className={LABEL}>
                Duration <span className="text-gray-500">(optional)</span>
              </label>
              <select
                id="job-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={submitting}
                className={INPUT}
              >
                <option value="">Not specified</option>
                {JOB_DURATIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="job-shift" className={LABEL}>
                Shift <span className="text-gray-500">(optional)</span>
              </label>
              <select
                id="job-shift"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                disabled={submitting}
                className={INPUT}
              >
                <option value="">Not specified</option>
                {JOB_SHIFTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section
            title="Pay"
            hint="A single rate, or a range. This is the first thing most people look at."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="job-pay-min" className={LABEL}>
                  Rate
                </label>
                <input
                  id="job-pay-min"
                  type="text"
                  inputMode="decimal"
                  placeholder="45"
                  value={payRateMin}
                  onChange={(e) => {
                    setPayRateMin(e.target.value);
                    clearError("pay_rate_min");
                  }}
                  disabled={submitting}
                  className={INPUT}
                />
                <FieldError message={errors.pay_rate_min} />
              </div>

              <div>
                <label htmlFor="job-pay-max" className={LABEL}>
                  Up to <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="job-pay-max"
                  type="text"
                  inputMode="decimal"
                  placeholder="55"
                  value={payRateMax}
                  onChange={(e) => {
                    setPayRateMax(e.target.value);
                    clearError("pay_rate_max");
                  }}
                  disabled={submitting}
                  className={INPUT}
                />
                <FieldError message={errors.pay_rate_max} />
              </div>

              <div>
                <label htmlFor="job-pay-unit" className={LABEL}>
                  Per
                </label>
                <select
                  id="job-pay-unit"
                  value={payUnit}
                  onChange={(e) => {
                    setPayUnit(e.target.value);
                    clearError("pay_unit");
                  }}
                  disabled={submitting}
                  className={INPUT}
                >
                  {PAY_UNITS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.pay_unit} />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Leave <span className="font-semibold">Up to</span> empty for a
              single rate. Numbers only — the currency and the unit are added
              for you.
            </p>
          </Section>

          <Section
            title="Requirements"
            hint="All optional. Leave anything you do not insist on empty rather than guessing."
          >
            <div>
              <label htmlFor="job-min-experience" className={LABEL}>
                Minimum experience
              </label>
              <select
                id="job-min-experience"
                value={minYearsExperience}
                onChange={(e) => setMinYearsExperience(e.target.value)}
                disabled={submitting}
                className={INPUT}
              >
                <option value="">No minimum</option>
                {JOB_EXPERIENCE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="job-certification" className={LABEL}>
                Certification required
              </label>
              <input
                id="job-certification"
                type="text"
                placeholder="e.g. OSHA 30, fire alarm certification"
                value={certificationRequired}
                onChange={(e) => setCertificationRequired(e.target.value)}
                disabled={submitting}
                className={INPUT}
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresOwnTools}
                  onChange={(e) => setRequiresOwnTools(e.target.checked)}
                  disabled={submitting}
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 accent-[var(--color-accent)]"
                />
                <span className="text-white">Must have own tools</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresOwnTransport}
                  onChange={(e) => setRequiresOwnTransport(e.target.checked)}
                  disabled={submitting}
                  className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 accent-[var(--color-accent)]"
                />
                <span className="text-white">Must have own transport</span>
              </label>
            </div>

            <div>
              <label className={LABEL}>Union status</label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setRequiredUnionStatus(
                      requiredUnionStatus === "union" ? null : "union"
                    )
                  }
                  disabled={submitting}
                  className={`px-5 py-3 rounded-lg font-semibold border transition disabled:opacity-50 ${
                    requiredUnionStatus === "union"
                      ? "bg-transparent border-accent text-white"
                      : "bg-zinc-800 border-zinc-700 text-gray-400"
                  }`}
                >
                  Union Required
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRequiredUnionStatus(
                      requiredUnionStatus === "non_union" ? null : "non_union"
                    )
                  }
                  disabled={submitting}
                  className={`px-5 py-3 rounded-lg font-semibold border transition disabled:opacity-50 ${
                    requiredUnionStatus === "non_union"
                      ? "bg-transparent border-accent text-white"
                      : "bg-zinc-800 border-zinc-700 text-gray-400"
                  }`}
                >
                  Non-Union Required
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Click a selected option again to remove the requirement.
              </p>
            </div>
          </Section>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-accent text-on-accent px-6 py-4 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-h-11"
          >
            <ButtonSpinner active={submitting} />
            {submitting ? "Posting..." : "Post Job"}
          </button>
        </div>
      </Card>
    </div>
  );
}
