-- Phase 2.4: allow account deletion without destroying shared state.
--
-- Two audit-style FKs to `auth.users` currently block user deletion:
--   - items.added_by          — who added this item
--   - households.created_by   — who first created this household
--
-- Both are "who made this" pointers. When the referenced user deletes
-- their account, the rows themselves should survive (a shared household
-- keeps working after one member leaves forever); only the attribution
-- is lost. Relax the FK to `on delete set null` and drop the NOT NULL
-- constraints so the cascade can fire without tripping.
--
-- We deliberately leave `items.added_by` nullable in the schema — the
-- Insert policy still enforces `added_by = auth.uid()` at write time, so
-- new items always land with a valid user. The null state is only
-- reached post-factum when that user deletes their account.

alter table items
  alter column added_by drop not null;

alter table items
  drop constraint items_added_by_fkey;

alter table items
  add constraint items_added_by_fkey
    foreign key (added_by) references auth.users(id) on delete set null;

alter table households
  alter column created_by drop not null;

alter table households
  drop constraint households_created_by_fkey;

alter table households
  add constraint households_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;
