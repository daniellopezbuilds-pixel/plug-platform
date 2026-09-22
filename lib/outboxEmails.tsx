/**
 * The templates the email outbox can render.
 *
 * ONE RENDERER PER `email_outbox.template` VALUE, resolved by
 * app/api/email/drain. The database queues a template name and a payload and
 * never builds markup — so a wording or layout fix reaches mail that has been
 * queued and not yet sent, and the table does not carry a kilobyte of inlined
 * CSS per row.
 *
 * FOLLOWS docs/email-templates/README.md TO THE LETTER, the same as
 * lib/dailySummaryEmail.tsx. Those rules are constraints, not preferences:
 *
 *   - Tables for layout. No flexbox, no grid, no float.
 *   - All CSS inline. No <style> block, no classes, therefore no media
 *     queries — width="100%" with max-width:600px reflows on its own.
 *   - Light ground (#F4F4F5). Dark backgrounds break in Outlook and some Gmail
 *     configurations, which force text colours and can leave light on light.
 *   - Web-safe fonts only. No Google Fonts; @import and <link> do not work.
 *   - Bulletproof button: a <td> carrying bgcolor with a padded <a> inside.
 *   - The raw URL under the button, because some clients strip one or the
 *     other and the link has to survive as readable text.
 *   - Wordmark as text, never an image — images are blocked by default.
 *   - A preheader, or the client pulls the wordmark as preview text.
 */

const FONT = "Helvetica, Arial, sans-serif";

/**
 * HTML-escape.
 *
 * Applied to EVERY interpolated value without exception. The payloads rendered
 * here carry a full_name that came from a signup form, which is to say from a
 * stranger — the one string in this file that an attacker chooses.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The shell every outbox email shares: brand rule, wordmark, body, footer.
 *
 * `preheader` and `body` are inserted as HTML and are built by the callers
 * below from escaped parts. Nothing reaches this function straight from a
 * payload.
 */
function shell(options: {
  title: string;
  preheader: string;
  heading: string;
  body: string;
  siteUrl: string;
}): string {
  const { title, preheader, heading, body, siteUrl } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F4F5; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F4F4F5;">
  ${preheader}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#FFFFFF; border-radius:8px;">

        <tr>
          <td style="height:4px; background-color:#FF5E3A; font-size:0; line-height:0; border-radius:8px 8px 0 0;">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0 32px; font-family:${FONT}; font-size:24px; font-weight:bold; line-height:28px;">
            <span style="color:#18181B;">Sparx</span><span style="color:#FF5E3A;">&nbsp;Plug</span>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 0 32px; font-family:${FONT}; font-size:20px; font-weight:bold; line-height:26px; color:#18181B;">
            ${esc(heading)}
          </td>
        </tr>

${body}

        <tr>
          <td style="padding:32px 32px 28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:1px; background-color:#E4E4E7; font-size:0; line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 28px 32px; font-family:${FONT}; font-size:12px; line-height:19px; color:#71717A;">
            You are receiving this because it affects the security of your
            Sparx Plug account. It is not a marketing email and there is
            nothing to unsubscribe from.<br>
            <a href="${esc(siteUrl)}" style="color:#AC419F; text-decoration:underline;">${esc(siteUrl)}</a>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

/** A paragraph row in the body column. */
function paragraph(html: string, topPadding = 16): string {
  return `
        <tr>
          <td style="padding:${topPadding}px 32px 0 32px; font-family:${FONT}; font-size:15px; line-height:23px; color:#3F3F46;">
            ${html}
          </td>
        </tr>`;
}

/**
 * The bulletproof button, plus the raw URL underneath it.
 *
 * Both halves are required by the template rules — some clients strip the
 * table-and-anchor button, some strip anchors entirely, and the destination has
 * to survive as text either way.
 */
function button(label: string, href: string): string {
  return `
        <tr>
          <td style="padding:24px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#FF5E3A" style="border-radius:6px;">
                  <a href="${esc(href)}" style="display:inline-block; padding:12px 24px; font-family:${FONT}; font-size:15px; font-weight:bold; line-height:20px; color:#FFFFFF; text-decoration:none; border-radius:6px;">${esc(label)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 32px 0 32px; font-family:${FONT}; font-size:12px; line-height:19px; color:#71717A;">
            Or paste this into your browser:<br>
            <a href="${esc(href)}" style="color:#AC419F; text-decoration:underline; word-break:break-all;">${esc(href)}</a>
          </td>
        </tr>`;
}

export type OutboxPayload = Record<string, unknown>;

/** A payload value as a trimmed string, or null. Payloads are jsonb. */
function str(payload: OutboxPayload, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

/**
 * "Someone entered your licence number."
 *
 * THIS EMAIL NAMES NOBODY, and that is the same rule the on-screen message
 * follows — see cslbOwnerStatus() in lib/cslb.tsx. A blocked claim is far more
 * often a typo than a theft, and an email saying who did it would hand one user
 * another user's identity on the strength of a number they typed. The admin
 * queue has both accounts; that is where a human decides.
 *
 * It also says plainly that nothing has happened to their badge. The worst
 * version of this email is one that alarms someone into thinking they have lost
 * their verification, and then gives them nothing to do about it.
 */
function licenseClaimAttempt(payload: OutboxPayload, siteUrl: string): string {
  const name = str(payload, "full_name");
  const licenseNumber = str(payload, "license_number");

  const greeting = name ? `Hi ${esc(name)},` : "Hi,";

  const numberLine = licenseNumber
    ? paragraph(
        `The number entered was <strong style="color:#18181B;">${esc(
          licenseNumber
        )}</strong>, which is the licence on your verified badge.`
      )
    : "";

  return shell({
    title: "Someone entered your contractor licence number",
    preheader:
      "We blocked it. Your verified badge is unaffected and no action is needed.",
    heading: "Someone entered your licence number",
    siteUrl,
    body:
      paragraph(greeting, 20) +
      paragraph(
        "Someone tried to register your C-10 contractor licence number on a " +
          "different Sparx Plug account."
      ) +
      numberLine +
      paragraph(
        `<strong style="color:#18181B;">We blocked it, and nothing has changed on your account.</strong> ` +
          "A licence can only be verified on one account, so the other claim " +
          "was held back for a human to look at. Your verified badge is " +
          "exactly as it was."
      ) +
      paragraph(
        "There is nothing you need to do. If this was you, setting up a " +
          "second account, reply to this email and we will sort it out."
      ) +
      // Straight to Credentials, matching the in-app notification this email
      // accompanies. The licence number is the subject of the message and it
      // lives on that tab.
      button(
        "Open your credentials",
        `${siteUrl}/dashboard/profile?tab=credentials`
      ),
  });
}

/** Renderers by `email_outbox.template`. */
const TEMPLATES: Record<
  string,
  (payload: OutboxPayload, siteUrl: string) => string
> = {
  license_claim_attempt: licenseClaimAttempt,
};

/**
 * Render a queued row, or null when the template is unknown.
 *
 * Null rather than a throw so one unrecognised row cannot stop the drain from
 * delivering the rest of the queue. The route records it as a failure on that
 * row and moves on — which is the behaviour you want when a template has been
 * renamed and queued rows still reference the old name.
 */
export function renderOutboxEmail(
  template: string,
  payload: OutboxPayload,
  siteUrl: string
): string | null {
  const render = TEMPLATES[template];
  return render ? render(payload ?? {}, siteUrl) : null;
}
