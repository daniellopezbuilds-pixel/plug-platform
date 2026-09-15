# Signup and Brand accounts — spec

Working spec for the signup revision and the Brand advertising feature.
Place at `docs/signup-and-brand-spec.md`, referenced from the root `CLAUDE.md`.

**Build order:** forms and UI first. Do **not** create migrations yet. The schema
below is the agreed target — implement it once the forms are settled.

---

## 1. Signup  

### Problem with the current flow

Signup forces a single account type (Employer or Worker). That breaks for real
users: a C-10 contractor may also wire panels personally and teach a CE class.
One choice can't hold three truths.

### Fix: split into two questions

**Account type** — single select. Drives billing, permissions, and whether a
company entity is created.

| Value | Meaning |
|---|---|
| `company` | Hires, pulls permits, manages a crew |
| `individual` | Works, teaches, or trains on their own |
| `brand` | Advertises to the trade — does no electrical work |

**Roles** — multi-select, minimum 1, no maximum. Drives which dashboard
features appear. **Skipped entirely when account type is `brand`.**

| Value | Label |
|---|---|
| `contractor` | Contractor (C-10) |
| `electrician` | Electrician |
| `instructor` | Electrical instructor |
| `apprentice` | Apprentice / trainee |
| `office` | Office / permit coordinator |

### Credential fields

Shown only for the roles selected. **Optional at signup** — verify later, gate
the feature not the registration.

- `contractor` — CSLB license number, license state, business / DBA name, expiration
- `electrician` — certification number (ET card), classification, years of experience
- `instructor` — instructor / provider approval number, subjects taught, affiliated program
- `apprentice` — trainee registration number, program or school, hours logged
- `office` — company filed for, jurisdictions filed in

### Brand profile fields

Replaces the role picker when `type = brand`.

- Brand name
- Website
- Category
- Billing contact

### Rules

1. Minimum one role for `company` / `individual`. Enforce inline, not with a
   disabled button.
2. Gate features on **roles**, never on account type. An individual C-10 holder
   must still be able to file permits.
3. Roles are editable in profile settings. Signup is not a one-shot identity decision.
4. Google login sits **above** the email field. After OAuth returns, drop the
   user into account type + roles — same screen, no credential inputs. Never
   dead-end on a completed OAuth with no profile.
5. `company` accounts can enable a brand workspace later from settings, so a
   supply house doesn't need two logins.

---

## 2. Brand mode

Dashboard mode switcher gains a third entry: Company / Individual / **Brand**.

Brand mode is a distinct dashboard — no permits, no jobs, no CE tracking:

- **Branding deals** → **Advertisement** (campaigns). Room later for
  Sponsored content and Sponsored courses as separate deal types.
- **Billing** — invoices, payment method, spend to date
- **Analytics** — impressions, clicks, leads per campaign

### Key principle

**The roles picked at signup are the targeting segments brands buy.** Do not
build a second taxonomy for ad targeting. A brand buys "C-10 contractors in LA
County," which is a join against the same role tables.

---

## 3. Advertisement campaigns

### Form sections

1. **Objective** — awareness / leads / traffic / event signups
2. **Placements** (multi-select, min 1) — content feed, permit dashboard
   sidebar, job board, class + CE pages, newsletter, mobile app banner
3. **Audience** — role targeting (reuses the signup roles) + state + city/county
4. **Budget** — daily cap, run length, computed total
5. **Creative** — headline, body, image, destination URL
6. **Review** — submit for approval, or save as draft

### Pricing

Start with **flat monthly placement rates**, not an auction. An auction needs
enough simultaneous bidders to produce a sensible clearing price. Move to CPM
when demand outstrips inventory.

### Status pipeline

```
draft -> in_review -> approved -> live -> paused -> ended
                   -> rejected
```

`in_review` is **required**, not optional. This is a compliance product. An ad
for unlicensed contracting services or a fake CE provider appearing next to
permit filings is a real liability. Human approval before live, at least until
volume forces automation.

---

## 4. Database structure (target — build after forms)

### 4.1 Signup side

The earlier draft stored roles as an array on the account. **Changed to a join
table.** Ad targeting has to filter accounts by role, and an array column makes
that a scan instead of an index lookup. This is the one structural revision to
the signup schema.

```
roles                          -- reference table, seeded
  key            pk    text    -- contractor | electrician | instructor | apprentice | office
  label                text
  sort_order           int
  active               bool

accounts
  id             pk
  type                 enum    -- company | individual | brand
  email                text    unique
  auth_provider        enum    -- password | google
  created_at           timestamptz

account_roles                  -- many-to-many; empty for brand accounts
  account_id     fk -> accounts
  role_key       fk -> roles
  created_at           timestamptz
  pk (account_id, role_key)

role_credentials               -- one row per role the account holds
  id             pk
  account_id     fk -> accounts
  role_key       fk -> roles
  fields               jsonb   -- shape varies per role; see section 1
  verified             bool    default false
  verified_at          timestamptz
  unique (account_id, role_key)
```

`fields` is jsonb because each role carries a different set of inputs and those
sets will change. Don't make five credential tables.

### 4.2 Brand side

```
brand_profiles                 -- one per brand account, or per brand workspace
  id             pk
  account_id     fk -> accounts
  name                 text
  website              text
  category             text
  logo_url             text
  billing_contact      text
  status               enum    -- pending | approved | suspended

branding_deals                 -- the container; an account's book of business
  id             pk
  brand_id       fk -> brand_profiles
  name                 text
  deal_type            enum    -- advertisement | sponsored_content | sponsored_course
  status               enum    -- draft | active | ended
  starts_on            date
  ends_on              date
  total_budget         numeric
  created_at           timestamptz

placements                     -- your ad inventory, reference table
  key            pk    text    -- feed | permit_dashboard | jobs | courses | newsletter | app_banner
  label                text
  description          text
  base_rate            numeric
  rate_model           enum    -- flat_month | cpm | cpc
  active               bool

advertisements                 -- a campaign inside a deal
  id             pk
  deal_id        fk -> branding_deals
  objective            enum    -- awareness | leads | traffic | event_signups
  status               enum    -- draft | in_review | approved | live | paused | ended | rejected
  starts_on            date
  ends_on              date
  created_at           timestamptz

advertisement_placements       -- which surfaces this ad buys
  advertisement_id fk -> advertisements
  placement_key    fk -> placements
  rate_model           enum
  rate                 numeric -- snapshot at purchase; never read live from placements
  pk (advertisement_id, placement_key)

advertisement_targeting
  advertisement_id fk -> advertisements   unique
  role_keys            text[]  -- references roles.key
  state                text
  county               text
  city                 text

advertisement_budgets
  advertisement_id fk -> advertisements   unique
  daily_cap            numeric
  run_days             int
  total                numeric
  spend_to_date        numeric default 0

advertisement_creatives        -- allows A/B later
  id             pk
  advertisement_id fk -> advertisements
  headline             text
  body                 text
  image_url            text
  destination_url      text
  is_active            bool

advertisement_reviews          -- the in_review gate
  id             pk
  advertisement_id fk -> advertisements
  reviewer_id    fk -> accounts
  decision             enum    -- approved | rejected | changes_requested
  notes                text
  reviewed_at          timestamptz

advertisement_metrics_daily    -- rollup, not raw events
  advertisement_id fk -> advertisements
  day                  date
  impressions          int
  clicks               int
  leads                int
  spend                numeric
  pk (advertisement_id, day)
```

### 4.3 Notes on the shape

- **Deal wraps campaign.** `branding_deals` is the commercial agreement;
  `advertisements` are what runs under it. Keeping them separate means a single
  deal can later hold a sponsored course and two ad campaigns without a schema
  change.
- **Rates are snapshotted** on `advertisement_placements`. If you raise
  newsletter pricing next quarter, live campaigns keep the rate they bought at.
- **`role_keys` on targeting is an array** — this one is fine as an array,
  because you filter accounts by targeting, not targeting by role.
- **Metrics are daily rollups.** Do not store one row per impression. If you
  later need raw events, that's a separate append-only table feeding this one.
- **No `brands` table separate from `accounts`.** A brand is an account with
  `type = brand` plus a `brand_profiles` row. Same login, same billing, same
  session handling.

---

## 5. Open decisions

- **Lead-gen data sharing.** Does a brand ever see *who* clicked, or only
  aggregate numbers? Lead campaigns imply handing over contractor contact
  details. Decide the privacy commitment before building the analytics screen —
  it determines whether `advertisement_metrics_daily` is sufficient or whether
  you need a per-lead table with consent tracking.
- **Contractor on an individual account.** Recommended yes — plenty of C-10
  holders are sole proprietors. If billing assumes contractor means company,
  auto-suggest switching instead of blocking.
- **Brand workspaces on company accounts.** If a company can hold a
  `brand_profiles` row, `brand_profiles.account_id` is not unique. Decide before
  writing the constraint.