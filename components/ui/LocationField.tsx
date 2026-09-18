"use client";

import { useState } from "react";
import {
  CALIFORNIA_CITIES,
  OTHER_LOCATION,
  listedCityFor,
} from "@/lib/locations";

type Props = {
  /** The stored value — a city name, or anything a user typed before this list existed. */
  value: string;
  onChange: (next: string) => void;
  /** Applied to both controls, so each page keeps its own input styling. */
  className: string;
  /** Prefix for the two control ids, so a label can point at the select. */
  id: string;
  "aria-label"?: string;
  /** Rendered under whichever control is last. */
  error?: string;
  /**
   * The caller's own label styling, so the State line sits at the same weight
   * as the labels around it on whichever page this is used.
   */
  labelClassName: string;
};

/**
 * City select with an "Other" escape hatch, over lib/locations.tsx.
 *
 * A COMPONENT RATHER THAN THE INLINE PATTERN used for Trade on the profile
 * page, because this control is now in two places — signup and the profile
 * editor — and the interesting part is not the select, it is the two separate
 * reasons the free-text box opens. Written twice, those two reasons drift.
 *
 * The box shows when the user PICKED Other, or when the saved value is not one
 * of the listed cities. Deriving it from `value` alone cannot tell "Other,
 * nothing typed yet" (value "") from "nothing chosen yet" (also ""), so picking
 * Other would instantly hide the box it just asked for. Deriving it from the
 * pick alone loses every legacy value on load — and on the profile page `value`
 * arrives from a fetch some time AFTER mount, so it has to be a derivation and
 * not an initial state.
 */
export function LocationField({
  value,
  onChange,
  className,
  id,
  error,
  labelClassName,
  ...rest
}: Props) {
  /** Whether the box is open because Other was chosen, as opposed to an unlisted value. */
  const [pickedOther, setPickedOther] = useState(false);

  const listed = listedCityFor(value);
  const showOther = pickedOther || (!!value && !listed);

  return (
    <div className="space-y-2">
      {/* STATE, SHOWN AND NOT ASKED.
          The city list is California only, so a dropdown of twenty Californian
          cities with no state anywhere near it reads, to someone in Phoenix, as
          a list that has simply forgotten them. Naming the state turns "my city
          is missing" into "this is a California list", which is a different and
          answerable thought — and Other is then visibly the right door.

          Read-only text rather than a second select, matching the State field
          on the branding deals form: it is fixed, so making it a control would
          imply it could be changed. */}
      <div>
        <p className={labelClassName}>State</p>
        <p className="py-1 font-semibold text-white">California</p>
      </div>

      <div>
      <label htmlFor={id} className={labelClassName}>
        City
      </label>

      <select
        id={id}
        aria-label={rest["aria-label"] ?? "City"}
        value={listed ?? (showOther ? OTHER_LOCATION : "")}
        onChange={(e) => {
          // Switching TO Other clears the field so the box starts empty rather
          // than holding the city they just left. Switching to a listed city
          // stores it directly, which is also what narrows a legacy
          // "Los Angeles, CA" to "Los Angeles".
          const next = e.target.value;
          setPickedOther(next === OTHER_LOCATION);
          onChange(next === OTHER_LOCATION ? "" : next);
        }}
        className={className}
      >
        <option value="">Select your city</option>
        {CALIFORNIA_CITIES.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
        <option value={OTHER_LOCATION}>Other</option>
      </select>
      </div>

      {/* The one place an out-of-state address can be entered, which is why the
          placeholder names a state rather than just a city: the fixed
          "California" above is the list's scope, not a restriction on who may
          hold an account. */}
      {showOther && (
        <input
          id={`${id}-other`}
          type="text"
          placeholder="City, State — e.g. Phoenix, AZ"
          aria-label="Your city"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
