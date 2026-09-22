/**
 * Accounts that are not real users: demo data and the team's own logins.
 *
 * TWO CONSUMERS, ONE LIST.
 *
 *   public.traffic_summary()  keeps them out of the daily summary email
 *   useDirectory              keeps them out of My Local Network
 *
 * WHY ANALYTICS. The numbers in that email are meant to answer "how is the
 * platform doing" over breakfast. Demo accounts and the team's own logins
 * answer a different question and, at current volume, drown out the first one —
 * six seeded demo profiles against a handful of real signups makes the count
 * read as growth that did not happen. A number that flatters is worse than no
 * number, because it gets believed and then acted on.
 *
 * WHY THE DIRECTORY. Same accounts, worse consequence: a real electrician
 * browsing My Local Network was being shown test profiles as if they were
 * people they could hire or work for. One address here had already been
 * reported as visible to real users.
 *
 * THE TWO USES ARE THE SAME SET TODAY and share this list deliberately — a
 * second copy is how "internal" comes to mean two different things. If they
 * ever need to diverge, split them then, with the reason written down; do not
 * pre-emptively keep two lists that happen to match.
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

/**
 * Adds "and not one of ours" to a PostgREST query on a table with an email
 * column.
 *
 * NULL-SAFE, AND THAT IS THE WHOLE REASON THIS IS A FUNCTION. The obvious
 * spelling is `.not("email", "ilike", pattern)`, and it silently drops every
 * row whose email is NULL — `NOT (NULL ILIKE '...')` is NULL, not true, so
 * those rows fail the filter and vanish from the directory. profiles.email is
 * nullable. There are none on staging today, which is exactly the kind of fact
 * that makes a bug like this ship and then appear later as "some accounts are
 * missing".
 *
 * So each pattern becomes `email IS NULL OR email NOT ILIKE pattern`, and the
 * separate .or() calls AND together — a row survives only if it dodges every
 * pattern.
 *
 * The patterns are sent as query parameters, never interpolated into SQL, so
 * an entry above cannot become an injection.
 */
export function excludeInternalAccounts<
  Q extends { or(filter: string): Q },
>(query: Q, column = "email"): Q {
  return EXCLUDED_EMAIL_PATTERNS.reduce(
    (q, pattern) => q.or(`${column}.is.null,${column}.not.ilike.${pattern}`),
    query
  );
}
