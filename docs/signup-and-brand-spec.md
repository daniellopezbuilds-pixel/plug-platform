# Signup and Brand accounts — spec

Working spec for the signup revision and the Brand advertising feature.
Referenced from the root `CLAUDE.md`.

**Revision note.** The first draft of this spec was written before the codebase
was read. Several parts described tables and surfaces that do not exist. This
version is reconciled against what actually ships today. Sections that describe
current behavior are marked **(today)**; everything else is target state.

**Build order:** forms and UI first. Do **not** create migrations yet. The
schema below is the agreed target — implement it once the forms are settled.

---

## 0. What exists today

Read this before designing against the sections below. Tables, columns, types
and foreign keys were verified against the live database on 2026-09-09 and are
listed in full in `docs/schema-inventory.md`.

Defaults, indexes, CHECK constraints, **RLS policies** and **triggers** are not
captured anywhere yet — they exist only in the Supabase dashboard until
`npm run db:pull` runs. See `supabase/README.md`.

### 0.1 Tables in use

`profiles`, `jobs`, `applications`, `connections`, `conversations`,
`conversation_participants`, `messages`, `notifications`, `posts`,
`post_comments`, `post_reactions`, `reviews`, `employer_documents`,
`general_requests`, `sponsored_listings`.

Also present: `workers` (bigint PK, `name`, `trade`, `xp`). **Nothing in the
codebase reads or writes it.** It predates `profiles` and is dead. Confirm it is
empty, then drop it — do not model anything against it.

Storage buckets: `sponsored-listings` (ad images), `branding` (company logos
and banners), `resumes`.

**There is no `accounts` table, no permits module, and no CE/courses module.**
Any part of the earlier draft that assumed permits or CE surfaces was
describing a product that has not been built.

### 0.2 `profiles` — this is the account table

One row per `auth.users` row, keyed on the same `id`. Full verified column list
(`created_at` omitted below for brevity):

```
id                   pk, = auth.users.id
email, full_name, username, profile_number, bio, trade, location, xp
role                          -- 'worker' | 'employer'
account_type                  -- 'worker' | 'employer'   (same vocabulary as role)
active_role                   -- 'worker' | 'employer'
is_admin              bool
messaging_subscribed  bool
union_status, union_verified
years_experience
resume_path
employer_verified     bool
company_logo_path, company_banner_path, company_description, company_website
```

**All three identity columns are plain nullable `text`.** There are no
Postgres enum types anywhere in the schema — every column the earlier draft
called an "enum" is `text`. So section 2's collapse is a re-value plus a CHECK
constraint, not an enum migration.

Three columns hold overlapping identity state. `role` is written from signup
auth metadata and read in `app/dashboard/messages/page.tsx`. `account_type` is
read with a fallback — `profile.account_type || profile.role` — in
`app/dashboard/profile/[id]/page.tsx` and `ProfilePreviewModal.tsx`, then
compared against the literal `"employer"`. `active_role` drives the sidebar nav
and the dashboard body. Collapsing these is section 2.

### 0.3 What actually gates anything **(today)**

| Gate | Field | Where |
|---|---|---|
| Sidebar nav + dashboard body | `active_role` | `components/layout/Sidebar.tsx`, `app/dashboard/page.tsx` |
| Admin panel | `is_admin` | `hooks/useIsAdmin.tsx` |
| Messaging | `messaging_subscribed` | `app/dashboard/messages/page.tsx`, Stripe webhook |
| Employer badge | `employer_verified` | display only, gates nothing |
| Union badge | `union_status` / `union_verified` | display only, gates nothing |

`trade` is free text. It is displayed and used as a marketplace filter. It is
not an enum and not a role.

### 0.4 `sponsored_listings` — the ad table **(today)**

```
id, title, image_path, link_url
placement             -- 'jobs_board' | 'marketplace' | 'feed'
is_active      bool
status                -- 'pending' | 'approved' | 'rejected'
start_date, end_date
is_paid_ad     bool
payment_status        -- free text: 'unpaid' | 'n/a' | ...
amount_charged numeric
submitted_by   fk -> profiles.id
created_at
```

Two write paths exist. `hooks/useSubmitAdRequest.tsx` (user-facing, from
`/dashboard/requests`) inserts `status: 'pending'`, `is_active: false`.
`hooks/useAds.tsx` (admin, from `/dashboard/admin`) inserts
`status: 'approved'`, `is_active: true` directly. Approval in
`hooks/useAdRequests.tsx` sets `status: 'approved'`, `is_active: true`, and
overwrites dates plus the payment fields.

### 0.5 How ads actually render **(today)**

`hooks/usePublicAds.tsx` pulls every listing for one placement where
`is_active` and `status = 'approved'` and today falls inside the date window,
newest first. The page then decides where each one goes:

- **Top banner** — `ads[0]`, rendered as `AdBanner`
- **In-list card** — every 5th item (`FEED_AD_INTERVAL`), rotating through the
  pool, rendered as `FeedAdCard`
- **Bottom banner** — `ads[ads.length - 1]`, rendered as `AdBanner`

Identical logic in `app/dashboard/feed/page.tsx`,
`app/dashboard/jobs/page.tsx`, and `app/dashboard/marketplace/page.tsx`.

**The consequence: `placement` is a page, not a slot.** A brand buys a surface
and lands in all three positions on it. Slot position is computed at render
time and is not stored, not sold, and not priced. `hooks/useActiveAd.tsx`
exists as a single-ad variant of the same query but is not currently imported
by any page.

### 0.6 Ad creative constraints **(today)**

From `lib/ads.tsx`, enforced in the form and again in `uploadAdImage` so an
off-spec image cannot reach storage:

- 4:1 aspect ratio, ±2% tolerance
- Minimum 1200×300px
- PNG, JPEG or WebP; max 2MB

There is one image and one optional `link_url`. `title` is stored and rendered
as a caption under the image in `FeedAdCard`, and used as `alt` text in both
components. There are no headline or body fields anywhere.

---

## 1. Signup

### Problem with the current flow

`app/signup/page.tsx` forces one choice — Worker or Employer — and writes it
into auth metadata as `role`. A database trigger creates the `profiles` row
from that metadata.

That breaks for real users: a C-10 contractor may also wire panels personally
and teach a CE class. One choice can't hold three truths.

### Fix: one clear question, more added later

**Signup type** — single select, no default, asked first. Four choices:

| `signup_type` | Label | Maps to `role` | Maps to `account_type` | Maps to `roles.key` |
|---|---|---|---|---|
| `c10` | C-10 contractor | `employer` | `company` | `contractor` |
| `electrician` | Electrician | `worker` | `individual` | `electrician` |
| `instructor` | Electrical instructor | `worker` | `individual` | `instructor` |
| `brand` | Brand | — | — | — |

`brand` renders its full field set but is blocked at submit: no auth user, no
`profiles` row, nothing written. The other three each collect one flat set of
optional fields — see "Signup fields" below.

Note the vocabulary gap: `signup_type` `c10` is `roles.key` `contractor`. The
mapping lives in `roleKeyFor()` in `lib/signupRoles.tsx` and nowhere else.

`account_type` and `roles` are **derived** from `signup_type`, not asked
separately. `signup_type` is authoritative; if the three ever disagree in
`raw_user_meta_data`, trust `signup_type` and re-derive.

`apprentice` and `office` remain in the `roles` table and in ad targeting, but
are not offered at signup.

### Why this is single-select, and what that cost

The original design here was two questions — an account type plus a role
multi-select — on the argument that **one choice can't hold three truths**: a
C-10 contractor may also wire panels personally and teach a CE class, and
forcing one answer makes the account a lie from day one.

That reasoning is still correct, and it is still why the schema underneath is
many-to-many (`account_roles`, section 4.1) rather than a single column. **The
schema did not change.** What changed is only what signup asks.

The trade-off taken: a shorter signup that most people finish, against a first
answer that is incomplete for the minority who wear several hats. Signup asks
for the one that describes them best; the rest get added to the profile later,
which is why `account_roles` is a join table and not a `role` column.

The cost is real and worth naming: **there is no UI yet for adding the
additional roles.** `/dashboard/profile` edits a free-text `trade` field and
nothing else. Until that UI exists, the multi-role model is reachable only by
direct database write, and the signup copy says only "You can add more to your
profile later" — deliberately making no promise about where or when. Building
that editor is what closes this gap; until it ships, single-select is a real
narrowing of what the product can represent, not just a shorter form.

### Signup fields

One flat set per type, all optional, collected at step 3 and sent as
`signup_fields`. Nothing verifies any of it.

| Type | Fields |
|---|---|
| `c10` | name of certification, license number, business name, anything else |
| `electrician` | certification, classification, anything else |
| `instructor` | certification or approval, subjects taught, affiliated school or program, anything else |
| `brand` | brand name, website, category, billing contact |

### Roles are data-capture-only in this phase

The earlier draft said "gate features on roles, never on account type." That
rule is right as a direction and wrong as a description of this phase.
**Every one of the five roles gates nothing today, and nothing in this phase
makes them gate anything.** Be honest about that in the UI copy and don't build
authorization plumbing for it.

| Role | Feature it would gate | Status |
|---|---|---|
| `contractor` | Permit filing | No permits module exists |
| `electrician` | Jobs, applications | Gated by `active_mode`, not role |
| `instructor` | CE course authoring | No CE module exists |
| `apprentice` | Hours / CE tracking | No CE module exists |
| `office` | Permit filing on behalf of a company | No permits module exists |

What roles are for in this phase:

1. Profile display — richer than the free-text `trade` field.
2. Ad targeting segments (section 3). This is the one place a role selection
   has a real consequence.
3. Data capture, so the taxonomy is populated before the features that need it
   are built.

Nav and dashboard body stay gated on `active_mode` (section 2). Do not
introduce a second, role-based gating path alongside it — that is how you end
up with two authorization systems disagreeing.

### Credentials are not verified

Nothing verifies any signup field in this phase. `role_credentials.verified`
exists so the column is there when an admin review flow is built; it stays
`false`, and any backfill reading `signup_fields` out of `raw_user_meta_data`
must keep it that way — that metadata is client-writable and user-claimed. See
the backfill rule in `supabase/pending.sql` section 6.

The fuller per-role credential sets — including `apprentice` and `office`, and
fields like licence expiry and hours logged — are what `role_credentials.fields`
is shaped to hold. Signup collects a lighter subset; the rest belongs to the
profile editor that does not exist yet.

### Brand profile fields

Brand is one of the four signup types, and its fields replace the credential
set. It is blocked at submit and creates nothing.

- Brand name
- Website
- Category
- Billing contact

`profiles` already carries `company_logo_path`, `company_banner_path`,
`company_description`, and `company_website`, all writable from
`/dashboard/profile` with no gating. Reuse those columns for a brand's logo,
banner, description, and site rather than adding parallel ones —
`brand_profiles` then holds only what is genuinely brand-specific (category,
billing contact, approval status).

### Rules

1. A signup type must be chosen — no default. Enforce inline, not with a
   disabled button.
2. Signup is not a one-shot identity decision. The schema holds many roles per
   account even though signup asks for one, so additional roles can be added
   without a migration. **The editor for that does not exist yet** — building it
   is what makes rule 2 true rather than aspirational, and until then the signup
   copy promises nothing more than "you can add more to your profile later."
3. `company` accounts can enable a brand workspace later from settings, so a
   supply house doesn't need two logins. See the open decision in section 6 on
   what that does to the `brand_profiles` uniqueness constraint.
4. **Google login is net-new work.** There is no `signInWithOAuth` call
   anywhere in the codebase — signup is email and password only. If OAuth is in
   scope, it is a full task: provider config, callback route, and a post-OAuth
   profile-completion screen. If it is not in scope, cut it from this phase
   rather than leaving it as a one-line rule. Either way, never dead-end on a
   completed OAuth with no profile row.

---

## 2. One account type, one active mode

Collapse `role`, `account_type`, and `active_role` into two columns:

- **`account_type`** — `company | individual | brand`. What the account is.
- **`active_mode`** — which dashboard is currently showing.

`account_type` already exists and already holds `'worker'` / `'employer'`, so
this is a re-value plus a backfill, not a new column.

### Migration shape

```
employer -> company
worker   -> individual
```

Applied to `account_type` and, as `active_mode`, to `active_role`. `role` is
dropped once `app/dashboard/messages/page.tsx` stops reading it.

Call sites to update, all comparing against the literal `"employer"` or
`"worker"`:

- `hooks/useActiveRole.tsx` — selects and updates `active_role`, defaults to
  `"worker"`, and its `switchRole` signature is typed `"worker" | "employer"`
- `components/layout/RoleSwitch.tsx` — hardcodes the two-button array
- `components/layout/Sidebar.tsx` — nav gating
- `app/dashboard/layout.tsx` — passes `activeRole` through
- `app/dashboard/page.tsx` — picks `WorkerDashboard` vs `EmployerDashboard`
- `app/dashboard/profile/[id]/page.tsx` and
  `components/profile/ProfilePreviewModal.tsx` — the `isEmployer` check
- `app/dashboard/messages/page.tsx` — reads `role`
- `app/signup/page.tsx` — writes `role` into auth metadata
- The signup trigger that creates the profile row from that metadata

The name `role` is also used for an unrelated purpose in
`hooks/useConversations.tsx` and `hooks/useConversationParticipants.tsx`, which
type a joined participant's `role`. Check whether those read `profiles.role` or
a `conversation_participants` column before dropping anything.

`is_admin` is not part of this taxonomy. It stays its own boolean.

### Which modes an account can switch to

| `account_type` | Available `active_mode` values |
|---|---|
| `company` | `company`, plus `brand` if a brand workspace is enabled |
| `individual` | `individual` |
| `brand` | `brand` |

`RoleSwitch` currently renders a fixed two-button array. It becomes a list
driven by the available modes for the account, and it should not render at all
when there is only one.

---

## 3. Brand mode

A third dashboard mode. No jobs, no applicants, no marketplace:

- **Branding deals** → the account's campaigns
- **Billing** — invoices, payment method, spend to date

**Analytics is cut from this phase.** It was specified against
`advertisement_metrics_daily`, and that table is cut (section 4.6). There is no
impression or click tracking of any kind in the codebase today — `AdBanner` and
`FeedAdCard` render a plain `<a>` with no instrumentation. A brand dashboard
cannot show impressions, clicks, or leads until that is built. Ship brand mode
without an analytics screen rather than with an empty one.

### Key principle

**The roles picked at signup are the targeting segments brands buy.** Do not
build a second taxonomy for ad targeting. A brand buys "C-10 contractors in LA
County," which is a join against the same role tables.

This is the reason `account_roles` is a join table rather than an array column
(section 4.1) and the reason the role picker is worth building even while the
roles gate nothing.

---

## 4. Database structure (target — build after forms)

### 4.1 Signup side

`profiles` **is** the account table. There is no `accounts` table and none is
being added — `profiles.id` is already the FK target used across jobs,
applications, messages, posts, reviews, and `sponsored_listings.submitted_by`.
Introducing a second account entity would mean rewriting every one of those.

```
profiles                       -- EXISTING, modified
  id             pk            -- = auth.users.id
  account_type         enum    -- company | individual | brand   (re-valued)
  active_mode          enum    -- company | individual | brand   (renamed from active_role)
  ...                          -- all existing columns unchanged
  -- dropped: role

roles                          -- NEW, reference table, seeded
  key            pk    text    -- contractor | electrician | instructor | apprentice | office
  label                text
  sort_order           int
  active               bool

account_roles                  -- NEW, many-to-many; empty for brand accounts
  profile_id     fk -> profiles.id
  role_key       fk -> roles.key
  created_at           timestamptz
  pk (profile_id, role_key)

role_credentials               -- NEW, one row per role the profile holds
  id             pk
  profile_id     fk -> profiles.id
  role_key       fk -> roles.key
  fields               jsonb   -- shape varies per role; see section 1
  verified             bool    default false
  verified_at          timestamptz
  unique (profile_id, role_key)
```

`fields` is jsonb because each role carries a different set of inputs and those
sets will change. Don't make five credential tables.

The join table rather than an array column is the one structural revision to
the signup schema. Ad targeting has to filter profiles by role, and an array
column makes that a scan instead of an index lookup.

### 4.2 Brand side — evolving `sponsored_listings`

`sponsored_listings` is **not** replaced. It is the live ad table with twelve
call sites across six hooks, an admin panel, a user request flow, and a storage
bucket named to match. Renaming it to `advertisements` buys nothing and breaks
all of that.

The change is to give it a parent and three satellite tables:

```
brand_profiles                 -- NEW, one per brand account or brand workspace
  id             pk
  profile_id     fk -> profiles.id
  name                 text
  category             text
  billing_contact      text
  status               enum    -- pending | approved | suspended
  created_at           timestamptz
  -- logo, banner, description and website live on profiles.company_*

branding_deals                 -- NEW, the container; an account's book of business
  id             pk
  brand_id       fk -> brand_profiles.id
  name                 text
  deal_type            enum    -- advertisement | sponsored_content | sponsored_course
  status               enum    -- draft | active | ended
  starts_on            date
  ends_on              date
  total_budget         numeric
  created_at           timestamptz

sponsored_listings             -- EXISTING, extended
  id             pk
  deal_id        fk -> branding_deals.id  NULLABLE    -- NEW
  objective            enum                           -- NEW: awareness | leads | traffic | event_signups
  title                text
  image_path           text
  link_url             text
  placement            enum    -- jobs_board | marketplace | feed
  status               enum    -- see 4.4
  is_active            bool
  start_date, end_date date
  is_paid_ad           bool
  payment_status       text
  amount_charged       numeric
  submitted_by   fk -> profiles.id
  created_at           timestamptz

sponsored_listing_targeting    -- NEW
  listing_id     fk -> sponsored_listings.id  unique
  role_keys            text[]  -- references roles.key
  state                text
  county               text
  city                 text

sponsored_listing_budgets      -- NEW
  listing_id     fk -> sponsored_listings.id  unique
  daily_cap            numeric
  run_days             int
  total                numeric
  spend_to_date        numeric default 0

sponsored_listing_reviews      -- NEW, audit trail for the approve/reject action
  id             pk
  listing_id     fk -> sponsored_listings.id
  reviewer_id    fk -> profiles.id
  decision             enum    -- approved | rejected | changes_requested
  notes                text
  reviewed_at          timestamptz

placements                     -- NEW, reference table; see 4.3
  key            pk    text    -- jobs_board | marketplace | feed
  label                text
  description          text
  base_rate            numeric
  rate_model           enum    -- flat_month | cpm | cpc
  active               bool
```

`deal_id` is nullable and must stay nullable. Every existing row has no deal,
and the admin panel's direct-create path in `hooks/useAds.tsx` legitimately
produces house ads with no brand behind them.

`sponsored_listing_targeting` and `sponsored_listing_budgets` are inert until
something reads them. `usePublicAds` does not filter on targeting today and
nothing decrements `spend_to_date`. Populating them is still correct — it is
how the brand-facing form stops lying about what it collects — but do not
describe targeting as live until the selection query in `usePublicAds` joins
against it.

### 4.3 Placement keys, reconciled

The earlier draft listed six placement keys. Three of the surfaces do not
exist, one was named wrong, and one that does exist was missing.

| Draft key | Reality |
|---|---|
| `feed` | **Exists.** `/dashboard/feed` |
| `jobs` | **Wrong name.** The stored value is `jobs_board`, `/dashboard/jobs` |
| — | **Missing from the draft.** `marketplace`, `/dashboard/marketplace` |
| `permit_dashboard` | No permits module exists |
| `courses` | No CE or courses module exists |
| `newsletter` | No newsletter exists |
| `app_banner` | No mobile app exists |

Seed `placements` with exactly the three that render: `jobs_board`,
`marketplace`, `feed`. Adding rows for inventory that does not exist means
selling it.

The `placements.base_rate` and `rate_model` columns are advisory. Pricing today
is a manual `amount_charged` typed by an admin at approval time, which is
already a snapshot — the rate a campaign bought at cannot drift when the rate
card changes, because nothing reads the rate card. Keep it that way: the
charged amount stays on the listing, and `placements.base_rate` is a quoting
aid, not an input to billing.

**Slot position is not a placement.** A single `placement` value buys the top
banner, the every-fifth in-list card, and the bottom banner on that page (see
0.5). If per-slot inventory is ever sold, that is a `slot` column plus a real
selection query, and it is not this phase.

### 4.4 Status pipeline

The earlier draft specified seven states. The code has three plus a boolean:

```
today:   pending -> approved (is_active = true)
                 -> rejected

target:  draft -> in_review -> approved -> live -> paused -> ended
                            -> rejected
```

`draft` is new and needed — the brand-facing form is multi-section and has to
be saveable mid-way. The current form submits or it doesn't.

`in_review` is **required**, not optional. This is a compliance product. An ad
for unlicensed contracting services or a fake CE provider appearing next to
trade content is a real liability. Human approval before live, at least until
volume forces automation. The existing `pending` state is `in_review` under
another name; rename rather than add.

`live` / `paused` / `ended` are `is_active` and the date window wearing
different names. `usePublicAds` already computes eligibility as
`status = 'approved' AND is_active AND start_date <= today <= end_date`. Either
express those three as derived state over the existing columns, or migrate
`is_active` into `status` and update the four hooks that read it — but do not
run both, or a paused ad with `is_active = true` will keep serving.

### 4.5 Creative — image only

**One image, at the existing 4:1 constraint. No headline, no body.**

`lib/ads.tsx` already enforces the full spec — 4:1 ±2%, minimum 1200×300, 2MB,
PNG/JPEG/WebP — in the form and again at upload. Both render components draw
the image into a `min(25%, 182px)` padding-top box with `object-contain`. A
headline and body have nowhere to go in that layout, and adding them means
redesigning both components and the storage-side validation for no gain.

Fields the creative keeps:

- `image_path` — the 4:1 image, required
- `link_url` — optional destination
- `title` — required; renders as the caption under the image in `FeedAdCard`
  and as `alt` text in both components. Keep it. It is not a headline; it is
  the accessible name and the caption.

No `advertisement_creatives` table. One image per listing, stored on the
listing, as it is today. A/B testing needs an impression counter to be
meaningful, and there is no impression counter.

### 4.6 Cut from this phase

**`advertisement_metrics_daily` — cut.** There is no event source. Nothing in
`AdBanner` or `FeedAdCard` fires an impression or a click; they render an `<a>`
with `target="_blank"`. A rollup table with no writer is a table that reports
zero. Build click instrumentation first, then the rollup, then the analytics
screen — as its own phase. The daily-rollup shape is still the right target
when that happens: do not store one row per impression.

**`auth_provider` on the account — cut.** Signup is email and password only;
there is no OAuth call in the codebase. Supabase already records the provider
on `auth.users`, so mirroring it onto `profiles` would be a denormalized copy
of a field with one possible value. If Google login ships, read it from the
auth user.

### 4.7 Notes on the shape

- **Deal wraps listing.** `branding_deals` is the commercial agreement;
  `sponsored_listings` rows are what runs under it. Keeping them separate means
  one deal can later hold a sponsored course and two ad campaigns without a
  schema change.
- **`role_keys` on targeting is an array** — this one is fine as an array,
  because you filter profiles by targeting, not targeting by role.
- **No `brands` table separate from `profiles`.** A brand is a profile with
  `account_type = 'brand'` plus a `brand_profiles` row. Same login, same
  billing, same session handling.
- **`submitted_by` already points at `profiles.id`.** The existing request flow
  works unchanged for brand accounts on day one, before any of the new tables
  land.

---

## 5. Brand campaign form

Sections, in order. Sections 3 and 4 write to tables nothing reads yet — that
is acceptable, but the copy must not imply the targeting is active.

1. **Objective** — awareness / leads / traffic / event signups
2. **Placement** — `jobs_board`, `marketplace`, `feed`. Single select today, to
   match the single `placement` column. Multi-select means one listing row per
   placement or a join table; decide before building the form, not after.
3. **Audience** — role targeting (reuses the signup roles) + state +
   city/county. Collected and stored; not yet applied at serve time.
4. **Budget** — daily cap, run length, computed total. Advisory until the admin
   sets `amount_charged` at approval.
5. **Creative** — one 4:1 image, title, destination URL. Reuse
   `validateAdImage` and `uploadAdImage` from `lib/ads.tsx` verbatim; do not
   write a second validator.
6. **Review** — submit for approval, or save as draft.

`components/requests/SubmitAdRequest.tsx` is the working precedent for sections
2, 5 and 6 — same validation, same feedback pattern, same submit shape. Build
the brand form as a superset of it rather than from scratch, and consider
whether the two should converge on one component.

### Pricing

Start with **flat monthly placement rates**, not an auction. An auction needs
enough simultaneous bidders to produce a sensible clearing price, and inventory
is currently three pages. Move to CPM when demand outstrips inventory, which
also requires the impression counter that does not exist.

---

## 6. Open decisions

- **Brand workspaces on company accounts.** If a company can hold a
  `brand_profiles` row, `brand_profiles.profile_id` is not unique. Decide
  before writing the constraint. This also determines whether `active_mode`
  needs to allow `brand` for `account_type = 'company'`, which section 2's
  table currently assumes it does.
- **Multi-placement campaigns.** One listing row per placement, or a
  `sponsored_listing_placements` join table? The current single-enum column is
  the cheapest path and matches how `usePublicAds` queries. Changing it touches
  every ad hook. Decide at form design time.
- **`is_active` versus `status`.** Section 4.4 offers two ways to express
  live/paused/ended. Pick one before the migration.
- **Lead-gen data sharing.** Does a brand ever see *who* clicked, or only
  aggregate numbers? Lead campaigns imply handing over contractor contact
  details. This is deferred with analytics, but decide the privacy commitment
  before building any tracking — it determines whether a rollup is sufficient
  or whether you need a per-lead table with consent tracking.
- **Contractor on an individual account.** Recommended yes — plenty of C-10
  holders are sole proprietors. If billing later assumes contractor means
  company, auto-suggest switching instead of blocking.
- **Capture the baseline.** Columns and foreign keys are now verified
  (`docs/schema-inventory.md`), but the RLS policies and the signup trigger
  still exist only in the dashboard. `supabase/migrations/` is set up and the
  signup migration is written, but it is blocked on reading the trigger body —
  see `supabase/README.md` step 1. Nothing should be pushed before that.
