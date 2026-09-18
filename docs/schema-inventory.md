# Schema inventory — live database, verified

Captured 2026-09-09 from the PostgREST OpenAPI schema of project
`ztjlyucyoiagdwafgppf`. This is read directly off the live database, not
inferred from application code.

**Amended 2026-09-18** for `20260918120000_profile_contact_location_experience`,
applied to both projects: `profiles.contact_number` is new, and
`profiles.years_experience` changed from `integer` to `text` because it now
holds a band (`'3-5 years'`) rather than a count. Everything else in this file
is still as captured on 2026-09-09.

## What this is authoritative about

Table names, column names, column types, NOT NULL, primary keys, and foreign
keys. Nothing else.

## What it cannot see

Default values, CHECK constraints, indexes, unique constraints beyond the
primary key, **RLS policies**, **triggers and functions**, storage buckets and
their policies, and FK on-delete behaviour. Those come from `npm run db:pull`
— see `supabase/README.md`.

Use this to verify that pull, not to replace it.

---

## `applications`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `job_id` | uuid |  | → jobs.id |
| `worker_id` | uuid |  | → profiles.id |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `status` | text |  |  |

## `connections`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `requester_id` | uuid | NOT NULL | → profiles.id |
| `recipient_id` | uuid | NOT NULL | → profiles.id |
| `status` | text | NOT NULL |  |
| `created_at` | timestamp with time zone |  |  |

## `conversation_participants`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `conversation_id` | uuid | NOT NULL | → conversations.id |
| `user_id` | uuid | NOT NULL | → profiles.id |
| `joined_at` | timestamp with time zone |  |  |
| `last_read_at` | timestamp with time zone |  |  |
| `hidden_at` | timestamp with time zone |  |  |

## `conversations`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `is_group` | boolean |  |  |
| `title` | text |  |  |
| `created_by` | uuid | NOT NULL | → profiles.id |
| `created_at` | timestamp with time zone |  |  |

## `employer_documents`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `user_id` | uuid | NOT NULL | → profiles.id |
| `label` | text | NOT NULL |  |
| `file_path` | text | NOT NULL |  |
| `created_at` | timestamp with time zone |  |  |

## `general_requests`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `submitted_by` | uuid | NOT NULL | → profiles.id |
| `subject` | text | NOT NULL |  |
| `message` | text | NOT NULL |  |
| `status` | text | NOT NULL |  |
| `admin_notes` | text |  |  |
| `created_at` | timestamp with time zone | NOT NULL |  |

## `jobs`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `user_id` | uuid |  |  |
| `title` | text |  |  |
| `location` | text |  |  |
| `pay` | text |  |  |
| `description` | text |  |  |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `company` | text |  |  |
| `required_union_status` | text |  |  |

## `messages`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `conversation_id` | uuid | NOT NULL | → conversations.id |
| `sender_id` | uuid | NOT NULL | → profiles.id |
| `content` | text | NOT NULL |  |
| `created_at` | timestamp with time zone |  |  |
| `deleted_at` | timestamp with time zone |  |  |

## `notifications`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `user_id` | uuid | NOT NULL | → profiles.id |
| `type` | text | NOT NULL |  |
| `title` | text | NOT NULL |  |
| `message` | text |  |  |
| `link` | text |  |  |
| `read` | boolean |  |  |
| `created_at` | timestamp with time zone |  |  |

## `post_comments`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `post_id` | uuid | NOT NULL | → posts.id |
| `author_id` | uuid | NOT NULL | → profiles.id |
| `content` | text | NOT NULL |  |
| `created_at` | timestamp with time zone | NOT NULL |  |

## `post_reactions`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `post_id` | uuid | NOT NULL | → posts.id |
| `user_id` | uuid | NOT NULL | → profiles.id |
| `reaction_type` | text | NOT NULL |  |
| `created_at` | timestamp with time zone | NOT NULL |  |

## `posts`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `author_id` | uuid | NOT NULL | → profiles.id |
| `post_type` | text | NOT NULL |  |
| `content` | text | NOT NULL |  |
| `job_title` | text |  |  |
| `job_location` | text |  |  |
| `created_at` | timestamp with time zone | NOT NULL |  |

## `profiles`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `email` | text | NOT NULL |  |
| `full_name` | text |  |  |
| `username` | text |  |  |
| `trade` | text |  |  |
| `xp` | bigint |  |  |
| `bio` | text |  |  |
| `created_at` | timestamp with time zone |  |  |
| `role` | text |  |  |
| `profile_number` | text |  |  |
| `account_type` | text |  |  |
| `active_role` | text |  |  |
| `union_status` | text |  |  |
| `union_verified` | boolean |  |  |
| `location` | text |  |  |
| `contact_number` | text |  |  |
| `years_experience` | text |  |  |
| `resume_path` | text |  |  |
| `company_logo_path` | text |  |  |
| `company_banner_path` | text |  |  |
| `company_description` | text |  |  |
| `company_website` | text |  |  |
| `employer_verified` | boolean |  |  |
| `is_admin` | boolean | NOT NULL |  |
| `messaging_subscribed` | boolean | NOT NULL |  |

## `reviews`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `application_id` | uuid | NOT NULL | → applications.id |
| `reviewer_id` | uuid | NOT NULL | → profiles.id |
| `reviewee_id` | uuid | NOT NULL | → profiles.id |
| `rating` | integer | NOT NULL |  |
| `comment` | text |  |  |
| `created_at` | timestamp with time zone |  |  |

## `sponsored_listings`

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK |
| `title` | text | NOT NULL |  |
| `image_path` | text | NOT NULL |  |
| `link_url` | text |  |  |
| `placement` | text | NOT NULL |  |
| `is_active` | boolean | NOT NULL |  |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `status` | text | NOT NULL |  |
| `submitted_by` | uuid |  | → profiles.id |
| `start_date` | date |  |  |
| `end_date` | date |  |  |
| `is_paid_ad` | boolean | NOT NULL |  |
| `payment_status` | text | NOT NULL |  |
| `amount_charged` | numeric |  |  |

## `workers`  ⚠️ not referenced by any application code

| Column | Type | Null | Key |
|---|---|---|---|
| `id` | bigint | NOT NULL | PK |
| `created_at` | timestamp with time zone | NOT NULL |  |
| `name` | text |  |  |
| `trade` | text |  |  |
| `xp` | bigint |  |  |
