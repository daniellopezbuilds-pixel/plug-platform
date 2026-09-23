"use client";

import { ChoiceGroup, FIELD_CONTROL, Field } from "@/components/ui/Form";
import { JOB_CLASSIFICATIONS, WORK_TYPES } from "@/lib/jobs";
import { activeJobFilterCount, NO_JOB_FILTERS, type JobFilters } from "@/hooks/useJobs";

const WORK_TYPE_OPTIONS = [
  { value: "", label: "Any" },
  ...WORK_TYPES.map((o) => ({ value: o.key, label: o.label })),
] as const;

const UNION_OPTIONS = [
  { value: "", label: "Any" },
  { value: "union", label: "Union" },
  { value: "non_union", label: "Non-union" },
  { value: "open", label: "No requirement" },
] as const;

/**
 * Narrow the Jobs Board by the three things an electrician rules a job in or
 * out on before reading it: classification, kind of work, union status.
 *
 * The same panel in both places it appears — the left or right rail on a
 * desktop, and a toggled panel above the list on a phone — so the two cannot
 * drift into offering different filters.
 *
 * Every change applies immediately; there is no Apply button. The list is
 * refetched from its first page with the filter in the query (see useJobs),
 * so pagination keeps working on the filtered set.
 */
export function JobFiltersPanel({
  filters,
  onChange,
  idPrefix,
}: {
  filters: JobFilters;
  onChange: (next: JobFilters) => void;
  /** Keeps ids unique if the panel is ever mounted twice. */
  idPrefix: string;
}) {
  const active = activeJobFilterCount(filters);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">
          Filter jobs
          {active > 0 && <span className="ml-1.5 text-accent">({active})</span>}
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={() => onChange(NO_JOB_FILTERS)}
            className="-my-2 -mr-2 min-h-11 rounded-md px-2 text-xs font-semibold text-accent-2-soft transition hover:text-white"
          >
            Clear all
          </button>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        <Field label="Classification" htmlFor={`${idPrefix}-classification`}>
          <select
            id={`${idPrefix}-classification`}
            value={filters.classification}
            onChange={(e) => onChange({ ...filters, classification: e.target.value })}
            className={FIELD_CONTROL}
          >
            <option value="">Any classification</option>
            {JOB_CLASSIFICATIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <ChoiceGroup
          name={`${idPrefix}-work-type`}
          legend="Work type"
          options={WORK_TYPE_OPTIONS}
          value={filters.workType}
          onChange={(next) => onChange({ ...filters, workType: next })}
        />

        <ChoiceGroup
          name={`${idPrefix}-union`}
          legend="Union status"
          options={UNION_OPTIONS}
          value={filters.union}
          onChange={(next) => onChange({ ...filters, union: next })}
        />
      </div>
    </section>
  );
}
