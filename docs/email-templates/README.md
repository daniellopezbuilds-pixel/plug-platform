# Auth email templates

Branded HTML for Supabase's auth emails. **Pasted into the Supabase dashboard
by hand** — nothing in this repo deploys them, and the dashboard is the live
copy. If someone edits a template in the dashboard, this directory silently
goes stale, so change it here and re-paste rather than editing in place.

Supabase dashboard → Authentication → Emails → Templates.

| File | Template slot | Suggested subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email address |
| `reset-password.html` | Reset password | Reset your password |
| `change-email.html` | Change email address | Confirm your new email address |
| `magic-link.html` | Magic link | Your sign-in link |

Paste the whole file, `<!DOCTYPE html>` included.

## Variables

Supabase substitutes Go template variables. The ones used here:

| Variable | Meaning | Notes |
|---|---|---|
| `{{ .ConfirmationURL }}` | The action link | All four templates |
| `{{ .Email }}` | The account's current address | All four |
| `{{ .SiteURL }}` | Site URL from project auth settings | All four, in the footer |
| `{{ .NewEmail }}` | The address being changed **to** | **Change email only** — empty elsewhere |

`{{ .NewEmail }}` is the one that is not interchangeable. In
`change-email.html` both addresses are named on purpose: showing only the new
one means a recipient cannot tell a change they requested from one an attacker
requested on their account.

Also available and unused here: `{{ .Token }}` (6-digit OTP),
`{{ .TokenHash }}`, `{{ .RedirectTo }}`, `{{ .Data }}` (user metadata). Note
that `{{ .Data }}` reads `raw_user_meta_data`, which is client-writable — never
put it anywhere that implies the platform is asserting it.

## The email HTML rules these follow

Email clients are not browsers. Each of these is a real constraint, not a
preference:

- **Tables for layout.** No flexbox, no grid, no float.
- **All CSS inline on the element.** No `<style>` block, no classes. A
  consequence worth knowing: **no media queries**, so responsiveness comes from
  `width="100%"` with `max-width:600px` inline, and the single column reflows
  on its own.
- **Light background.** Dark email backgrounds break in Outlook and some Gmail
  configurations, where the client forces text colours and can leave light text
  on a light ground — invisible. Brand comes through the orange rule, the
  button, and the near-black footer instead.
- **Web-safe fonts only** — `Helvetica, Arial, sans-serif`. No Google Fonts;
  `@import` and `<link>` do not work in most clients.
- **Bulletproof button** — a `<td>` carrying `bgcolor` plus a padded `<a>`
  inside it. Not a `<button>`, not a background image.
- **The raw URL under every button.** Some clients strip buttons, some strip
  anchors; the link has to survive as readable text.
- **Wordmark as text, not an image.** Images are blocked by default in most
  clients, and a blocked logo leaves an unbranded email.
- **Preheader** — the hidden line at the top is the grey preview text shown
  next to the subject in most inboxes. Without one, clients pull the first
  visible text instead, which here would be the wordmark.

## Colour

From `app/globals.css`, same tokens as the app.

| Use | Colour | Note |
|---|---|---|
| Button background | `#FF5E3A` | orange |
| Button text | `#000000` | black on orange is 6.91:1; white would be 3.04:1 and fail |
| Wordmark "Plug", brand rule | `#FF5E3A` | |
| Links on white | `#AC419F` | magenta, used sparingly |
| Links on the dark footer | `#C77CBD` | lightened deliberately — `#AC419F` on `#18181B` is about 3.4:1, too low for 12px text |
| Page ground | `#F4F4F5` | |
| Card | `#FFFFFF` | |
| Footer bar | `#18181B` | |

The orange wordmark is about 3:1 on white, which passes only because it is
large bold text. Do not reuse that colour for body copy.

## Worth knowing before blaming the templates

**Link scanners can consume single-use tokens.** Corporate mail filters and
some security products fetch every link in an email before delivery. Because
`{{ .ConfirmationURL }}` is single-use, a scanner that follows it can spend the
token, and the recipient then sees the "this link has expired" screen on their
first real click. If that gets reported, it is not
`app/reset-password/page.tsx` misbehaving — that page is doing the right thing
with a genuinely spent token. The fix is an OTP flow (`{{ .Token }}`) rather
than a link, which is a product change, not a template change.

**Deliverability is separate from these files.** The confirmation email
currently lands in Gmail spam because the sending domain is new and shares
history with another sender. Nothing in the HTML fixes that — it needs SPF,
DKIM and DMARC on the sending domain, and a warm-up period. Signup and
`/forgot-password` both tell users to check spam in the meantime.
