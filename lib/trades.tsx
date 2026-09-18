/**
 * The trades offered in the profile's Trade dropdown.
 *
 * EDIT THIS LIST FREELY. It is display and filter vocabulary, not a schema:
 * profiles.trade is plain text with no CHECK constraint and no foreign key, and
 * hooks/useDirectory.tsx filters the marketplace on it as a string. Adding,
 * renaming or reordering an entry needs no migration.
 *
 * What a rename DOES affect: existing rows keep the old string, so they stop
 * matching the renamed option and fall into "Other" on the profile form. That
 * is recoverable — the value is still shown and still saved — but it is the
 * reason to add rather than rename where you can.
 *
 * Order is the order they appear. Roughly most common first rather than
 * alphabetical, since the top of a select is where people stop reading.
 */
export const TRADES = [
  "Electrician",
  "Journeyman Electrician",
  "Apprentice Electrician",
  "Master Electrician",
  "Residential Wireman",
  "Inside Wireman",
  "Low Voltage Technician",
  "Solar Installer",
  "EV Charger Installer",
  "Fire Alarm Technician",
  "Security and Access Control",
  "Data and Network Cabling",
  "Lighting Technician",
  "Controls and Automation",
  "Estimator",
  "Project Manager",
  "Foreman",
  "Electrical Instructor",
] as const;

/**
 * The sentinel the select uses for "not one of the above".
 *
 * A literal that cannot collide with a real trade, because the select's value
 * is compared against TRADES to decide whether to reveal the free-text box.
 */
export const OTHER_TRADE = "__other__";

/**
 * Is this stored value one of the listed trades?
 *
 * Anything else — a trade typed before this list existed, or one entered
 * through "Other" — is not lost: it round-trips through the free-text input.
 * That is the whole reason this helper exists rather than the form assuming a
 * stored value is always in the list.
 */
export function isListedTrade(value: string | null | undefined): boolean {
  return !!value && (TRADES as readonly string[]).includes(value);
}
