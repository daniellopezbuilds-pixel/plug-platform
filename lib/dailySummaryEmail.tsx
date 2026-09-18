import { signupTypeLabel } from "@/lib/signupRoles";

/**
 * The daily summary email's HTML.
 *
 * FOLLOWS docs/email-templates/README.md TO THE LETTER. Those rules are
 * constraints, not preferences, and every one of them applies here:
 *
 *   - Tables for layout. No flexbox, no grid, no float.
 *   - All CSS inline. No <style> block, no classes, and therefore no media
 *     queries — width="100%" with max-width:600px, single column, reflows on
 *     its own.
 *   - Light ground (#F4F4F5). Dark backgrounds break in Outlook and some Gmail
 *     configurations, which force text colours and can leave light text on
 *     light. Brand comes from the orange rule, the numbers and the dark footer.
 *   - Web-safe fonts only. No Google Fonts; @import and <link> do not work.
 *   - Wordmark as text, never an image — images are blocked by default.
 *   - A preheader, or the client pulls the wordmark as preview text.
 *
 * Colours are the same tokens as the auth templates: #FF5E3A accent, #18181B
 * footer, #AC419F for links on white, #C77CBD for links on the footer (the
 * darker magenta is about 3.4:1 on #18181B, too low for 12px text).
 *
 * No button here, so no bulletproof-button table and no raw-URL fallback —
 * this email asks nothing of the reader.
 */

export type TrafficSummary = {
  visits_yesterday: number;
  visits_day_before: number;
  views_yesterday: number;
  visits_month: number;
  new_users_yesterday: number;
  new_users_by_type: Record<string, number>;
  new_users_month: number;
  users_total: number;
  yesterday_label: string;
  month_label: string;
};

const FONT = "Helvetica, Arial, sans-serif";

/** HTML-escape. Every value below is a number or a database string. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * "up 12 from 34" / "down 3 from 34" / "same as yesterday".
 *
 * Words, not an arrow glyph: ▲ and ▼ render as tofu in some clients and are
 * announced unhelpfully by screen readers. Colour is not carrying the meaning
 * either — the text says which direction it went, so it survives a client that
 * strips colour, and there is no red-means-bad judgement applied to a number
 * that is one day of noise.
 */
function trend(today: number, yesterday: number): string {
  if (yesterday === 0 && today === 0) return "no visits either day";
  if (today === yesterday) return `same as the day before (${formatNumber(yesterday)})`;

  const diff = today - yesterday;
  const direction = diff > 0 ? "up" : "down";

  return `${direction} ${formatNumber(Math.abs(diff))} from ${formatNumber(yesterday)} the day before`;
}

/** One big orange number with a label under it. */
function statRow(value: string, label: string, sub: string): string {
  return `
        <tr>
          <td style="padding:20px 32px 0 32px; font-family:${FONT};">
            <div style="font-size:34px; font-weight:bold; line-height:38px; color:#FF5E3A;">${value}</div>
            <div style="font-size:15px; font-weight:bold; line-height:22px; color:#18181B; padding-top:2px;">${label}</div>
            <div style="font-size:13px; line-height:20px; color:#52525B; padding-top:2px;">${sub}</div>
          </td>
        </tr>`;
}

function sectionHeading(text: string): string {
  return `
        <tr>
          <td style="padding:28px 32px 0 32px; font-family:${FONT}; font-size:12px; font-weight:bold; line-height:18px; letter-spacing:1.5px; text-transform:uppercase; color:#71717A;">
            ${esc(text)}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:1px; background-color:#E4E4E7; font-size:0; line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>`;
}

/**
 * The signup-type breakdown, as a small two-column table.
 *
 * Labels come from signupTypeLabel() so they read the same as the signup form
 * and cannot drift from it. An unrecognised key — including the 'unknown'
 * bucket the SQL uses for accounts with no signup_type — falls back to the raw
 * key rather than being dropped, because a new user with no type is still a new
 * user and hiding them would make the breakdown disagree with the total.
 */
function breakdownRows(byType: Record<string, number>): string {
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return "";

  const rows = entries
    .map(([key, count]) => {
      const label =
        signupTypeLabel(key) ?? (key === "unknown" ? "Not yet set" : key);

      return `
              <tr>
                <td style="padding:4px 0; font-family:${FONT}; font-size:14px; line-height:21px; color:#3F3F46;">${esc(label)}</td>
                <td align="right" style="padding:4px 0; font-family:${FONT}; font-size:14px; font-weight:bold; line-height:21px; color:#18181B;">${formatNumber(count)}</td>
              </tr>`;
    })
    .join("");

  return `
        <tr>
          <td style="padding:10px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
            </table>
          </td>
        </tr>`;
}

export function dailySummarySubject(summary: TrafficSummary): string {
  return `Sparx Plug — ${formatNumber(summary.visits_yesterday)} visits, ${formatNumber(
    summary.new_users_yesterday
  )} new ${summary.new_users_yesterday === 1 ? "user" : "users"}`;
}

export function dailySummaryHtml(summary: TrafficSummary, siteUrl: string): string {
  const {
    visits_yesterday,
    visits_day_before,
    views_yesterday,
    visits_month,
    new_users_yesterday,
    new_users_by_type,
    new_users_month,
    users_total,
    yesterday_label,
    month_label,
  } = summary;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Sparx Plug daily summary</title>
</head>
<body style="margin:0; padding:0; background-color:#F4F4F5; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

<!-- Preheader: the grey preview line next to the subject in most inboxes. -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#F4F4F5;">
  ${formatNumber(visits_yesterday)} visits and ${formatNumber(new_users_yesterday)} new users on ${esc(yesterday_label)}.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
  <tr>
    <td align="center" style="padding:24px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#FFFFFF; border-radius:8px;">

        <!-- Brand rule -->
        <tr>
          <td style="height:4px; background-color:#FF5E3A; font-size:0; line-height:0; border-radius:8px 8px 0 0;">&nbsp;</td>
        </tr>

        <!-- Wordmark. Text, not an image. -->
        <tr>
          <td style="padding:28px 32px 0 32px; font-family:${FONT}; font-size:24px; font-weight:bold; line-height:28px;">
            <span style="color:#18181B;">Sparx</span><span style="color:#FF5E3A;">&nbsp;Plug</span>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 0 32px; font-family:${FONT}; font-size:20px; font-weight:bold; line-height:26px; color:#18181B;">
            Daily summary
          </td>
        </tr>
        <tr>
          <td style="padding:4px 32px 0 32px; font-family:${FONT}; font-size:14px; line-height:21px; color:#52525B;">
            ${esc(yesterday_label)}
          </td>
        </tr>
${sectionHeading("Yesterday")}
${statRow(
  formatNumber(visits_yesterday),
  visits_yesterday === 1 ? "visit" : "visits",
  `${esc(trend(visits_yesterday, visits_day_before))} &middot; ${formatNumber(views_yesterday)} page ${
    views_yesterday === 1 ? "view" : "views"
  }`
)}
${statRow(
  formatNumber(new_users_yesterday),
  new_users_yesterday === 1 ? "new user" : "new users",
  new_users_yesterday === 0 ? "No signups yesterday" : "By signup type:"
)}
${new_users_yesterday === 0 ? "" : breakdownRows(new_users_by_type)}
${sectionHeading(`This month — ${month_label}`)}
${statRow(
  formatNumber(visits_month),
  visits_month === 1 ? "visit" : "visits",
  `Since 1 ${esc(month_label)}`
)}
${statRow(
  formatNumber(users_total),
  "users in total",
  `${formatNumber(new_users_month)} joined this month`
)}

        <tr>
          <td style="padding:28px 32px 32px 32px; font-family:${FONT}; font-size:13px; line-height:20px; color:#71717A;">
            A visit is one browser session, so several pages in a row count once.
            Days run midnight to midnight, Pacific.
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px; background-color:#18181B; border-radius:0 0 8px 8px; font-family:${FONT}; font-size:12px; line-height:19px; color:#A1A1AA;">
            <div style="color:#FFFFFF; font-weight:bold; font-size:13px; line-height:20px; padding-bottom:6px;">Sparx Plug &middot; Content marketing for electrical companies</div>
            Sent automatically each morning from <a href="${esc(siteUrl)}" style="color:#C77CBD; text-decoration:underline;">${esc(siteUrl)}</a>.
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}
