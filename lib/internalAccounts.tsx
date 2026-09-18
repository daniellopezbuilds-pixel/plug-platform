/**
 * Accounts excluded from the daily summary email.
 *
 * WHY. The numbers in that email are meant to answer "how is the platform
 * doing" over breakfast. Demo accounts and the team's own logins answer a
 * different question and, at current volume, drown out the first one — six
 * seeded demo profiles against a handful of real signups makes the count read
 * as growth that did not happen. A number that flatters is worse than no
 * number, because it gets believed and then acted on.
 *
 * TO ADD A TEAM MEMBER: add one line below and deploy. Deliberately a constant
 * here and not a database table or a dashboard setting — it lives in version
 * control, it is reviewable, and it cannot silently drift the way the auth
 * config and storage buckets already do (see supabase/README.md, "what the
 * baseline does not carry").
 *
 * These are SQL LIKE patterns, matched case-insensitively against
 * profiles.email by public.traffic_summary(). `%` is the wildcard; an entry
 * with no wildcard is an exact address. They are passed as a query PARAMETER,
 * never interpolated into SQL, so an entry cannot become an injection.
 */
export const EXCLUDED_EMAIL_PATTERNS: readonly string[] = [
  // Seeded demo data — scripts/seed-demo.mjs.
  "%@demo.sparxplug.com",

  // The internal team. Whole domain rather than named addresses, so a new
  // colleague is excluded from the day they sign up rather than the day someone
  // notices the numbers look wrong.
  "%@bbelectric.com",

  // Individually excluded.
  "29juliagime@gmail.com",
];
