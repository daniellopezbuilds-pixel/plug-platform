import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { renderOutboxEmail } from "@/lib/outboxEmails";

/**
 * Sends whatever the database has queued in email_outbox.
 *
 * WHY A QUEUE AND NOT A DIRECT SEND. Postgres cannot call Resend, and the three
 * paths that raise a licence-claim alert all run somewhere a server route does
 * not: a signup (inside handle_new_user), a profile edit (a browser write
 * straight to role_credentials), and the weekly import sweep. On the first two
 * the browser belongs to the person the alert is ABOUT, so it cannot be trusted
 * to make the call. The database writes a row in the same transaction as the
 * blocked claim, and this drains it. Full reasoning in the header of
 * 20260921150000_licence_notifications.sql.
 *
 *
 * THIS ROUTE CANNOT SEND ANYTHING THAT WAS NOT ALREADY QUEUED BY A TRIGGER.
 *
 * That is what makes its unusually open authentication safe. It takes no
 * recipient, no subject and no body — every one of those comes from a row a
 * SECURITY DEFINER function wrote. The caller chooses nothing except "now".
 *
 * So it accepts EITHER a signed-in user or the cron secret, and both are real:
 *
 *   - any signed-in user, so the signup page and the profile editor can nudge
 *     the queue the moment they write a credential. THIS IS THE NORMAL PATH,
 *     and it is what makes the alert arrive in seconds.
 *   - the cron, so a queued alert still goes out when nobody nudged it.
 *
 * THE CRON RUNS ONCE A DAY, and that is a plan limit rather than a choice --
 * Vercel Hobby allows one invocation per cron per day. So the two callers are
 * not interchangeable, and it is worth being precise about which case each one
 * actually covers:
 *
 *   - an ordinary signup or profile edit through our own pages nudges, and the
 *     alert is sent immediately
 *   - a claim made by someone crafting raw requests, who will obviously not
 *     call this, waits for the daily run
 *
 * The second is the slower half and it is the adversarial one, which is not
 * ideal. It is accepted because the block itself is immediate and unconditional
 * -- the licence cannot be verified on the second account whether or not any
 * email is ever sent -- so the delay is in the telling, not in the defending.
 * Moving to a plan with sub-daily crons is the one-line fix, in vercel.json.
 *
 * Hammering this achieves nothing, because a sent row is marked sent and never
 * selected again.
 *
 * The ESLint rule sparx/require-route-auth is satisfied honestly here — the
 * route really does call getUserFromRequest and really does refuse an anonymous
 * caller that has no secret either.
 */

/** Must be a sender on a domain verified in Resend. */
const FROM = process.env.OUTBOX_FROM ?? "Sparx Plug <noreply@sparxplug.com>";

const SITE_URL = "https://ecosystem.sparxplug.com";

/**
 * How many to send per invocation.
 *
 * Small on purpose. These are security alerts, so the queue is normally empty
 * or holds one row; a large batch would only ever matter after an outage, and a
 * bounded batch keeps the route inside a serverless timeout. Anything left over
 * goes out on the next call.
 */
const BATCH = 20;

/**
 * Give up after this many tries.
 *
 * A row that has failed five times is failing for a reason retrying will not
 * fix — a dead address, a template that no longer exists — and left unbounded
 * it would be retried on every cron run for ever, hiding real failures behind
 * a permanent one. It stays in the table with its last_error for someone to
 * look at.
 */
const MAX_ATTEMPTS = 5;

/** Timing-safe-ish comparison. Copied in shape from the daily-summary route. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return diff === 0;
}

function hasCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    // Vercel Cron sends the secret as a bearer token. A signed-in user sends a
    // Supabase JWT the same way, so this comparison simply fails for them and
    // getUserFromRequest is asked instead.
    if (secretMatches(header.slice(7).trim(), expected)) return true;
  }

  const custom = req.headers.get("x-cron-secret");
  return custom ? secretMatches(custom.trim(), expected) : false;
}

async function drain(req: NextRequest) {
  const authorised =
    hasCronSecret(req) || (await getUserFromRequest(req)) !== null;

  if (!authorised) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("email_outbox")
    .select("id, to_email, subject, template, payload, attempts")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error(
      "Email drain: could not read the outbox",
      JSON.stringify({ error: error.message })
    );
    return NextResponse.json({ error: "Could not read the queue." }, { status: 500 });
  }

  const queued = data ?? [];
  if (queued.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, pending: 0 });
  }

  // Checked here rather than at the top, so an empty queue does not report a
  // configuration error on every cron run in an environment that never sends.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Email drain: RESEND_API_KEY is not set");
    return NextResponse.json({ error: "Email is not configured." }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const row of queued) {
    const attempts = (row.attempts ?? 0) + 1;

    // Recorded BEFORE the send, not after. If this function dies mid-flight —
    // a timeout, a cold-start kill — the attempt still counts, so a row that
    // reliably kills the drain cannot be retried for ever and take the rest of
    // the queue down with it on every run.
    await supabaseAdmin
      .from("email_outbox")
      .update({ attempts })
      .eq("id", row.id);

    const html = renderOutboxEmail(row.template, row.payload ?? {}, SITE_URL);

    if (!html) {
      failed++;
      await supabaseAdmin
        .from("email_outbox")
        .update({ last_error: `Unknown template: ${row.template}` })
        .eq("id", row.id);
      console.error(
        "Email drain: unknown template",
        JSON.stringify({ id: row.id, template: row.template })
      );
      continue;
    }

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [row.to_email],
          subject: row.subject,
          html,
        }),
      });
    } catch (cause) {
      failed++;
      await supabaseAdmin
        .from("email_outbox")
        .update({ last_error: String(cause).slice(0, 500) })
        .eq("id", row.id);
      continue;
    }

    if (!response.ok) {
      // Resend's body carries the real reason — an unverified domain, a bad
      // key, a malformed From. Stored on the row so a stuck queue explains
      // itself without a log dive, and logged because a 403 here means no
      // security alert is reaching anyone.
      const body = await response.text().catch(() => "");
      failed++;
      await supabaseAdmin
        .from("email_outbox")
        .update({ last_error: `${response.status}: ${body.slice(0, 400)}` })
        .eq("id", row.id);
      console.error(
        "Email drain: Resend rejected the send",
        JSON.stringify({ id: row.id, status: response.status, body: body.slice(0, 500) })
      );
      continue;
    }

    sent++;
    await supabaseAdmin
      .from("email_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
  }

  // Nothing about WHO was mailed, or why. The caller may be any signed-in user.
  return NextResponse.json({
    ok: true,
    sent,
    failed,
    pending: queued.length === BATCH ? "more" : 0,
  });
}

export async function POST(req: NextRequest) {
  return drain(req);
}

/**
 * GET as well as POST, because Vercel Cron issues a GET and cannot be told to
 * do otherwise. The handler is identical and is not a read — which is a
 * deliberate exception to GET being safe, made once, here, for the scheduler.
 */
export async function GET(req: NextRequest) {
  return drain(req);
}
