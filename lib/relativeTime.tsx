/**
 * "3 days ago" for activity lists.
 *
 * Deliberately coarse. An activity feed is scanned, not read, and "2 days ago"
 * carries everything the reader needs — a precise timestamp is noise there and
 * the exact value is on the record itself if anyone wants it.
 *
 * Intl.RelativeTimeFormat rather than a table of strings: it is built in, it
 * handles the singular/plural split ("1 day ago" vs "2 days ago") without a
 * ternary per unit, and it will localise if this app ever needs to.
 */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const elapsed = Date.now() - then;

  // Clock skew, or a row written with a future timestamp. "just now" is a
  // better answer than "in 3 minutes" on an activity list.
  if (elapsed < 60 * 1000) return "just now";

  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) {
      return formatter.format(-Math.floor(elapsed / ms), unit);
    }
  }

  return "just now";
}
