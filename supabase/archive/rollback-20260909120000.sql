-- =============================================================================
-- ROLLBACK for 20260909120000_signup_roles_and_account_mode.sql
--
-- NOT a migration. Do not put this in supabase/migrations/. Paste it into the
-- Supabase SQL editor if the signup migration has to be undone.
--
-- WHY THIS IS CLEAN
--
-- The forward migration destroys no information. Every existing row had
-- account_type = 'both' -- the column default, which nothing ever overwrote --
-- so restoring 'both' everywhere is exact, not approximate. active_role and
-- role are never written by the forward migration, so there is nothing to
-- restore there either.
--
-- The one thing that is NOT reversible is data created after the migration
-- ran: rows in account_roles and role_credentials written by the new trigger
-- for people who signed up in the window. Section 4 keeps them by default.
--
-- Run the sections in order. 1 and 2 are the ones that matter.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Restore the signup trigger
--
-- Verbatim from the baseline, 20260908000000_remote_schema.sql. Do this FIRST:
-- while the new function is live and the new tables are gone, every signup
-- fails.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, full_name, role, xp)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'worker'),
    0
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is null;


-- -----------------------------------------------------------------------------
-- 2. Undo the profiles changes
--
-- Order matters: drop the constraints before restoring 'both', or the restore
-- violates the CHECK it is trying to remove.
-- -----------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_account_type_ck,
  drop constraint if exists profiles_active_mode_ck;

alter table public.profiles
  alter column account_type drop not null,
  alter column active_mode  drop not null;

update public.profiles
set account_type = 'both';

alter table public.profiles
  alter column account_type set default 'both';

alter table public.profiles
  drop column if exists active_mode;

comment on column public.profiles.role is null;
comment on column public.profiles.active_role is null;

-- If 4c was uncommented in the forward migration, active_role was rewritten
-- and the previous per-user values are NOT recoverable -- they were not saved
-- anywhere. The closest honest restore is the app's own default:
--
--   update public.profiles set active_role = coalesce(role, 'worker');
--
-- Only run that if 4c was actually used.


-- -----------------------------------------------------------------------------
-- 3. Restore the grants on role_credentials
--
-- Only needed if section 4 below is NOT run, i.e. the table is being kept.
-- Skipping this while keeping the table leaves authenticated able to update
-- only `fields`, which is the intended state anyway.
-- -----------------------------------------------------------------------------

-- (nothing required unless the table is dropped)


-- -----------------------------------------------------------------------------
-- 4. The three new tables — DESTRUCTIVE, and off by default
--
-- Dropping these throws away every account_roles and role_credentials row
-- written since the migration ran. Leaving them in place costs nothing: no app
-- code reads them, and the forward migration can be re-applied over them
-- because every create is `if not exists`.
--
-- Check what you would be destroying before deciding:
--
--   select (select count(*) from public.account_roles)    as account_roles,
--          (select count(*) from public.role_credentials) as role_credentials;
--
-- Uncomment only if you are sure.
-- -----------------------------------------------------------------------------

-- drop table if exists public.role_credentials;
-- drop table if exists public.account_roles;
-- drop table if exists public.roles;
-- drop function if exists public.role_credentials_touch_updated_at();


-- -----------------------------------------------------------------------------
-- 5. Migration history
--
-- The remote history table still lists the migration as applied. Clear it so a
-- later `db push` does not skip a corrected version:
--
--   ! npx supabase migration repair --status reverted 20260909120000
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 6. Verify
--
-- Expect: account_type 'both' for every row, no active_mode column, and the
-- restored trigger function with no comment.
-- -----------------------------------------------------------------------------

select account_type, count(*) from public.profiles group by 1;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('account_type', 'active_mode', 'role', 'active_role');
