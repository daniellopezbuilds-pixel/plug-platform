/**
 * Job posting fields — the option lists, their labels, and how a job reads.
 *
 * ONE DEFINITION FOR THREE SURFACES: the posting form, the job card and the
 * detail modal. The same rule the signup fields follow in lib/signupRoles.tsx,
 * and for the same reason — a list written out twice is a list that drifts, and
 * here a drift means a job posted with a value the board cannot label.
 *
 * KEYS MATCH THE CHECK CONSTRAINTS in
 * supabase/migrations/20260922170000_job_detail_columns.sql. A value added here
 * without being added there is rejected by Postgres at insert; a value added
 * there without being added here renders as its raw key. Change both.
 */

import { ELECTRICIAN_CLASSIFICATIONS, EXPERIENCE_BANDS } from "./signupRoles";

/**
 * What classification the work needs.
 *
 * RE-EXPORTED FROM signupRoles RATHER THAN RESTATED. These are the same seven
 * strings an electrician picks at signup, and that is the whole point: a job's
 * requirement and a worker's classification are the same vocabulary, so
 * matching them later is a comparison and not a translation table.
 */
export const JOB_CLASSIFICATIONS = ELECTRICIAN_CLASSIFICATIONS;

/** Minimum experience, sharing the profile's bands for the same reason. */
export const JOB_EXPERIENCE_BANDS = EXPERIENCE_BANDS;

export type JobOption<K extends string> = { key: K; label: string };

export const WORK_TYPES = [
  { key: "residential", label: "Residential" },
  { key: "commercial", label: "Commercial" },
  { key: "industrial", label: "Industrial" },
  { key: "service", label: "Service" },
] as const satisfies readonly JobOption<string>[];

export const JOB_DURATIONS = [
  { key: "one_day", label: "One day" },
  { key: "under_week", label: "Under a week" },
  { key: "one_to_four_weeks", label: "1–4 weeks" },
  { key: "ongoing", label: "Ongoing" },
] as const satisfies readonly JobOption<string>[];

export const JOB_SHIFTS = [
  { key: "day", label: "Day" },
  { key: "night", label: "Night" },
  { key: "weekend", label: "Weekend" },
  { key: "flexible", label: "Flexible" },
] as const satisfies readonly JobOption<string>[];

export const PAY_UNITS = [
  { key: "hour", label: "Per hour" },
  { key: "day", label: "Per day" },
] as const satisfies readonly JobOption<string>[];

/**
 * A stored key's label, or the key itself when it is not in the list.
 *
 * FALLS BACK RATHER THAN RENDERING NOTHING. A job posted before a key was
 * renamed should show something a reader can act on, not a blank chip — the
 * same reasoning as the unrecognised-reason fallback in lib/cslb.tsx.
 */
export function jobOptionLabel(
  options: readonly JobOption<string>[],
  key: string | null | undefined
): string | null {
  if (!key) return null;
  return options.find((o) => o.key === key)?.label ?? key;
}

/**
 * The pay line: "$45–55/hr", "$400/day", or the legacy free-text string.
 *
 * THE FALLBACK IS THE POINT. Seven jobs predate the structured columns and
 * have their rate only in the free-text `pay` field — "$42-48/hr DOE",
 * "$52/hr + shift differential". Those rows keep rendering exactly as they
 * did; everything posted since reads from the numbers. Returns null when
 * there is neither, so a caller can omit the line rather than print an empty
 * one.
 *
 * Trailing ".00" is dropped, because numeric(10,2) returns "45.00" from
 * PostgREST and nobody writes an hourly rate that way.
 */
export function formatPay(job: {
  pay_rate_min?: number | string | null;
  pay_rate_max?: number | string | null;
  pay_unit?: string | null;
  pay?: string | null;
}): string | null {
  const min = toNumber(job.pay_rate_min);

  if (min === null) return job.pay?.trim() || null;

  const max = toNumber(job.pay_rate_max);
  const unit = job.pay_unit === "day" ? "/day" : "/hr";
  const amount =
    max !== null && max !== min
      ? `$${money(min)}–${money(max)}`
      : `$${money(min)}`;

  return `${amount}${unit}`;
}

/** PostgREST hands numeric back as a string; the form holds it as a number. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

/**
 * A start date as a reader wants it: "Mon 6 Oct", or "Starts today".
 *
 * Parsed as a LOCAL date, not through `new Date("2026-10-06")`, which ISO
 * parses as UTC midnight and renders as the previous day for anyone west of
 * Greenwich — which is everyone this platform serves.
 */
export function formatStartDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;

  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.getTime() === today.getTime()) return "Starts today";

  return `Starts ${date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}`;
}

/**
 * What a new job post must carry, as { field: message }.
 *
 * SIX REQUIRED FIELDS, and the reason is editorial rather than technical: a
 * post with no pay, no city and no classification cannot be judged by an
 * electrician and clutters the board for everyone scrolling past it. The
 * remaining fields are genuinely optional — a job with no stated shift is
 * still a readable job.
 *
 * NOT ALSO ENFORCED IN THE SCHEMA, deliberately. The seven jobs posted before
 * these columns existed have none of them, and a NOT NULL applies to old rows
 * too. See the header of 20260922170000_job_detail_columns.sql.
 */
export type JobDraft = {
  title: string;
  classification: string;
  work_type: string;
  location: string;
  pay_rate_min: string;
  pay_rate_max: string;
  pay_unit: string;
  description: string;
};

export function jobDraftErrors(draft: JobDraft): Record<string, string> {
  const found: Record<string, string> = {};

  if (!draft.title.trim()) {
    found.title = "Give the job a title — it is the first thing on the card.";
  }

  if (!draft.classification) {
    found.classification =
      "Which classification the work needs. Pick the closest if none match exactly.";
  }

  if (!draft.work_type) {
    found.work_type = "Residential, commercial, industrial or service.";
  }

  if (!draft.location.trim()) {
    found.location = "Where the work is. Electricians filter on this.";
  }

  if (!draft.pay_unit) found.pay_unit = "Per hour or per day.";

  const min = draft.pay_rate_min.trim();
  const max = draft.pay_rate_max.trim();

  if (!min) {
    found.pay_rate_min = "What the job pays. A post with no rate gets skipped.";
  } else if (!isRate(min)) {
    found.pay_rate_min = "A number, e.g. 45 or 47.50.";
  } else if (max) {
    if (!isRate(max)) {
      found.pay_rate_max = "A number, e.g. 55. Leave it empty for a single rate.";
    } else if (Number(max) < Number(min)) {
      found.pay_rate_max = "The top of the range cannot be below the bottom.";
    }
  }

  if (!draft.description.trim()) {
    found.description =
      "Describe the work. This is what an electrician reads before applying.";
  }

  return found;
}

/** Digits with at most two decimals, and not negative. */
function isRate(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value);
}
