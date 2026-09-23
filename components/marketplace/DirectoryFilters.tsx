"use client";

import { ChoiceGroup, FIELD_CONTROL, Field } from "@/components/ui/Form";
import { CALIFORNIA_CITIES } from "@/lib/locations";

const UNION_OPTIONS = [
  { value: "", label: "Any" },
  { value: "union", label: "Union" },
  { value: "non_union", label: "Non-union" },
] as const;

/**
 * Narrow the directory by trade, city and union status.
 *
 * GROUPED, LABELLED, IN A PANEL — they were three bare inputs in a row with
 * placeholder text as the only label, which vanishes as soon as you type.
 *
 * CITY IS A LIST, not free text. It is matched with ILIKE, so the listed name
 * also finds legacy values like "Los Angeles, CA"; and a list cannot be
 * misspelled into an empty result. Trade stays free text, because it is free
 * text on the profile.
 *
 * Every change applies at once — useDirectory refetches from the first page
 * with the filter in the query, so paging still works on the filtered set.
 */
export function DirectoryFilters({
  trade,
  onTrade,
  location,
  onLocation,
  union,
  onUnion,
  idPrefix,
}: {
  trade: string;
  onTrade: (v: string) => void;
  location: string;
  onLocation: (v: string) => void;
  union: string | null;
  onUnion: (v: string | null) => void;
  idPrefix: string;
}) {
  const active = [trade.trim(), location, union].filter(Boolean).length;

  // A saved location that is not one of the listed cities still has to be
  // representable, or the select would show "Any" while filtering on it.
  const cityOptions =
    location && !CALIFORNIA_CITIES.includes(location as (typeof CALIFORNIA_CITIES)[number])
      ? [location, ...CALIFORNIA_CITIES]
      : CALIFORNIA_CITIES;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-white">
          Filter people
          {active > 0 && <span className="ml-1.5 text-accent">({active})</span>}
        </h2>
        {active > 0 && (
          <button
            type="button"
            onClick={() => {
              onTrade("");
              onLocation("");
              onUnion(null);
            }}
            className="-my-2 -mr-2 min-h-11 rounded-md px-2 text-xs font-semibold text-accent-2-soft transition hover:text-white"
          >
            Clear all
          </button>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        <Field label="Trade" htmlFor={`${idPrefix}-trade`}>
          <input
            id={`${idPrefix}-trade`}
            type="search"
            value={trade}
            onChange={(e) => onTrade(e.target.value)}
            placeholder="e.g. Electrician, Solar"
            className={FIELD_CONTROL}
          />
        </Field>

        <Field label="City" htmlFor={`${idPrefix}-city`}>
          <select
            id={`${idPrefix}-city`}
            value={location}
            onChange={(e) => onLocation(e.target.value)}
            className={FIELD_CONTROL}
          >
            <option value="">Any city</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </Field>

        <ChoiceGroup
          name={`${idPrefix}-union`}
          legend="Union status"
          columns={3}
          compact
          options={UNION_OPTIONS}
          value={(union ?? "") as "" | "union" | "non_union"}
          onChange={(next) => onUnion(next || null)}
        />
      </div>
    </section>
  );
}
