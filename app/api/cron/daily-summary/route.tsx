import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EXCLUDED_EMAIL_PATTERNS } from "@/lib/internalAccounts";
import {
  dailySummaryHtml,
  dailySummarySubject,
  type TrafficSummary,
} from "@/lib/dailySummaryEmail";

/**
 * The daily traffic summary email.
 *
 * @public-route — called by Vercel Cron, not by a signed-in user, so there is
 * no session and getUserFromRequest() has nothing to check. It is protected
 * instead by a shared secret in the Authorization header, compared against
 * CRON_SECRET. Without that env var set the route refuses every request
 * including the cron's, which is the right way round: a summary that stops
 * arriving gets noticed, a publicly callable mail trigger does not.
 *
 * WHY THE SECRET AND NOT OBSCURITY. The path is guessable and the route sends
 * mail and reads traffic data. Unprotected, anyone could mail-bomb Daniel from
 * our own domain and burn the Resend quota doing it.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations
 * when CRON_SECRET is set in the project, so this needs no custom header
 * wiring — but it also accepts x-cron-secret so the route can be triggered by
 * hand for a test without forging an Authorization header.
 */

/** Where the summary goes on a scheduled run. */
const RECIPIENT = "daniel@bbelectric.com";

/**
 * Domains a manual ?to= override may send to.
 *
 * Defaults to the configured recipient's own domain, so the override covers
 * "send me the test instead of Daniel" and nothing else. Set
 * DAILY_SUMMARY_TO_DOMAINS (comma-separated) to allow others — a personal
 * address for a one-off check, say.
 *
 * WHY THIS IS NOT JUST "ANY VALID ADDRESS". The route is protected by one
 * shared secret. An unrestricted ?to= would mean that anyone who ever obtains
 * that secret — a leaked env dump, a copied curl out of a terminal history —
 * can send mail to arbitrary strangers from a domain we have verified in
 * Resend. That is a materially worse failure than "can trigger Daniel's email
 * early": it burns sending reputation the auth emails depend on, and the
 * deliverability note in docs/email-templates/README.md says that reputation is
 * already fragile. An allowlist costs one line and removes the relay entirely.
 */
function allowedDomains(): string[] {
  const configured = process.env.DAILY_SUMMARY_TO_DOMAINS;

  const extra = (configured ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return [RECIPIENT.split("@")[1].toLowerCase(), ...extra];
}

/**
 * A single, syntactically valid address on an allowed domain, or null.
 *
 * Deliberately rejects anything containing a comma, semicolon or whitespace
 * before it looks at anything else. That blocks a list — the override is for
 * one test recipient, not a way to fan out — and it blocks the CR/LF that
 * header injection needs. Resend takes JSON rather than raw headers so
 * injection is not reachable today, but validating the shape is cheaper than
 * depending on someone else's parser forever.
 */
function parseOverrideRecipient(raw: string): string | null {
  const value = raw.trim();

  if (!value || /[,;\s]/.test(value)) return null;
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(value)) return null;

  const domain = value.split("@")[1].toLowerCase();

  return allowedDomains().includes(domain) ? value : null;
}

/**
 * Must be a sender on a domain verified in Resend. An unverified From is the
 * single most common reason a Resend call returns 403 with everything else
 * correct.
 */
const FROM = process.env.DAILY_SUMMARY_FROM ?? "Sparx Plug <noreply@sparxplug.com>";

const SITE_URL = "https://ecosystem.sparxplug.com";

/**
 * Timing-safe-ish comparison.
 *
 * Not crypto.timingSafeEqual, which throws on a length mismatch and would need
 * the lengths padded first. The loop below compares every byte regardless of
 * where the first difference is, which is the property that matters. Length is
 * checked up front and is not itself a secret.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return diff === 0;
}

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;

  // Refuses everything when unset — see the header comment.
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return secretMatches(header.slice(7).trim(), expected);
  }

  const custom = req.headers.get("x-cron-secret");
  if (custom) return secretMatches(custom.trim(), expected);

  return false;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    // 401 with nothing else. Saying "CRON_SECRET is not set" would tell an
    // unauthenticated caller about our configuration.
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  // Every number in one call, with the day boundaries worked out in Postgres
  // where the timezone is known. See traffic_summary() in
  // 20260917130000_page_views.sql.
  const { data, error } = await supabaseAdmin.rpc("traffic_summary", {
    // Demo and internal accounts, so the morning numbers are external signups
    // and external visitors. Passed as a bind parameter, never interpolated.
    excluded_email_patterns: EXCLUDED_EMAIL_PATTERNS,
  });

  if (error || !data) {
    console.error(
      "Daily summary: traffic_summary() failed",
      JSON.stringify({ error: error?.message })
    );
    return NextResponse.json({ error: "Could not read the summary." }, { status: 500 });
  }

  const summary = data as TrafficSummary;

  // A zero here after someone adds a pattern means the pattern is wrong — the
  // filter matched nothing and the numbers are unchanged. Cheaper to notice in
  // a log line than by wondering why demo accounts are still showing up.
  console.log(
    "Daily summary:",
    JSON.stringify({
      excluded_profiles: summary.excluded_profiles,
      excluded_sessions_month: summary.excluded_sessions_month,
      patterns: EXCLUDED_EMAIL_PATTERNS.length,
    })
  );

  /**
   * ?to= redirects this one send. Manual only, by construction rather than by
   * a flag: Vercel invokes the path in vercel.json exactly as written, with no
   * query string, so a scheduled run cannot carry an override and always goes
   * to RECIPIENT. There is nothing here for the cron to get wrong.
   */
  const requestedTo = req.nextUrl.searchParams.get("to");
  let recipient = RECIPIENT;

  if (requestedTo) {
    const override = parseOverrideRecipient(requestedTo);

    if (!override) {
      // Says which domains are acceptable, because the caller already holds the
      // secret and a silent fall back to Daniel's address would be worse — a
      // test that quietly mails the person it was meant to spare.
      return NextResponse.json(
        {
          error:
            "That recipient is not allowed. Use a single address on one of: " +
            allowedDomains().join(", ") +
            ". Set DAILY_SUMMARY_TO_DOMAINS to permit others.",
        },
        { status: 400 }
      );
    }

    recipient = override;
  }

  /**
   * ?preview=1 renders the email and sends nothing.
   *
   * Behind the same secret as the send, because it exposes the same traffic
   * numbers. It exists so the template can be checked in a browser against real
   * data without putting a test message in Daniel's inbox — the alternative is
   * mailing him every time a padding value changes.
   */
  if (req.nextUrl.searchParams.get("preview") === "1") {
    return new NextResponse(dailySummaryHtml(summary, SITE_URL), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Never cached or indexed: it is traffic data behind a shared secret.
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  // Checked here rather than at the top of the handler so ?preview=1 works
  // without an API key — the preview sends nothing and has no use for one.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Daily summary: RESEND_API_KEY is not set");
    return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [recipient],
      subject: dailySummarySubject(summary),
      html: dailySummaryHtml(summary, SITE_URL),
    }),
  });

  if (!response.ok) {
    // Resend's body carries the actual reason — an unverified domain, a bad
    // key, a malformed From. Logged rather than returned: the caller is a cron
    // job that does nothing with it, and it can name our configuration.
    const body = await response.text().catch(() => "");
    console.error(
      "Daily summary: Resend rejected the send",
      JSON.stringify({ status: response.status, body: body.slice(0, 500) })
    );
    return NextResponse.json({ error: "Could not send the email." }, { status: 502 });
  }

  // Echoed back so a manual run shows what was sent without opening the inbox,
  // and so the Vercel cron log line is useful on its own.
  return NextResponse.json({
    ok: true,
    sent_to: recipient,
    overridden: recipient !== RECIPIENT,
    visits_yesterday: summary.visits_yesterday,
    new_users_yesterday: summary.new_users_yesterday,
  });
}
