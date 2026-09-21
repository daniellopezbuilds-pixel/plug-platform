import { supabase } from "@/lib/supabase";

/**
 * Nudge the server to send anything the database has queued in email_outbox.
 *
 * WHY THE BROWSER IS INVOLVED AT ALL. A blocked licence claim queues a security
 * alert to the account that actually holds the licence, and it queues it inside
 * the database, from a trigger. Nothing on the server knows it happened. The
 * Vercel cron drains the queue on a schedule, which guarantees the alert goes
 * out — but on a daily schedule that is a slow alarm, so the pages that can
 * cause a claim also ask the server to drain now.
 *
 * BEST EFFORT, AND SAFE TO SKIP. This is an optimisation on top of the cron,
 * never the delivery mechanism:
 *
 *   - it is fire-and-forget: no await at the call sites, no error surfaced, and
 *     a failure changes nothing a user can see
 *   - it sends no recipient, subject or body. The route takes none. Everything
 *     mailed was written by a trigger, so the only thing this call chooses is
 *     the timing
 *   - an attacker crafting a raw signup request simply will not call it, and
 *     the cron then covers exactly that case
 *
 * That last point is why the alert is NOT sent from here directly: on the two
 * paths that matter, the browser belongs to the person the alert is about.
 */
export function nudgeEmailQueue(): void {
  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      await fetch("/api/email/drain", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch {
      // Deliberately silent. The cron is the guarantee; this is the hurry.
    }
  })();
}
