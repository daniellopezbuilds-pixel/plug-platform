-- =============================================================================
-- badges.icon -- the glyph each badge draws
--
-- STATUS: NOT YET APPLIED. Staging first -- see the loop in CLAUDE.md, and run
-- `npm run db:linked` before every push.
--
-- DEPLOY ORDER MATTERS HERE, and it is push-then-deploy:
--
--   1. push to staging, verify
--   2. push to production, verify
--   3. only then deploy the code
--
-- The app reads badges.icon (hooks/useMyBadges.tsx). Deploying that code before
-- this migration lands gives PostgREST a select on a column that does not
-- exist, which is a 400 and an empty Badges section -- exactly what happened on
-- staging. This migration is additive and invisible to the currently-deployed
-- build, which does not select the column, so pushing it early is safe and
-- pushing it late is not.
--
--
-- WHY THIS IS A SEPARATE FILE
--
-- 20260916130000_badges.sql created public.badges without this column and has
-- already been applied to staging and production. Adding the column to that
-- file would have changed nothing on either database -- the version is recorded
-- as applied and never runs again -- while leaving the file describing a table
-- that does not match what it built. A migration that lies about what it did is
-- worse than a missing column, because the next person reads the file rather
-- than the database.
--
-- So 20260916130000 stays exactly as it ran, and the column arrives here.
-- =============================================================================


alter table public.badges
  add column if not exists icon text not null default 'badge';

comment on column public.badges.icon is
  'Name of the glyph to draw, resolved by components/ui/BadgeIcon.tsx. Data '
  'rather than a switch in the component, so a new badge ships with its icon '
  'in this row. DELIBERATELY UNCONSTRAINED: a CHECK listing the known names '
  'would mean a migration every time one is added, and an unknown name is not '
  'worth failing an insert over -- BadgeIcon falls back to a generic mark and '
  'the badge still renders. There is no icon library in this project (the app '
  'hand-rolls inline SVG, as Sidebar.tsx and NotificationBell.tsx do); a '
  'genuinely new glyph is a change in that file.';


-- The three seeded badges. `where icon = 'badge'` rather than an unconditional
-- update: if someone has already set an icon by hand, this must not stamp over
-- it. 'badge' is the column default, so it means "never set".
update public.badges set icon = 'bolt'
  where key = 'early_member' and icon = 'badge';

update public.badges set icon = 'shield-check'
  where key = 'license_verified' and icon = 'badge';

update public.badges set icon = 'building-check'
  where key = 'business_verified' and icon = 'badge';


-- Surface anything that ends up with no real glyph, rather than letting it
-- reach the UI as a fallback ring nobody notices. Not an exception: an icon is
-- cosmetic and is not worth failing a deploy over.
do $$
declare
  unset text;
begin
  select string_agg(key, ', ' order by key)
    into unset
  from public.badges
  where active and icon = 'badge';

  if unset is not null then
    raise warning
      'badges with no icon set, will render the fallback mark: %', unset;
  end if;
end $$;
