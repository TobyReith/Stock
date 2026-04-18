-- Per-item overrides for product brand & category.
--
-- Context: the `products` table is a global, admin-only cache (ADR-0002)
-- shared across every household. When Open Food Facts returns wrong
-- metadata — common for German supermarket brands where OFF has a
-- generic label under the wrong category — we don't want one user's
-- correction to mutate the cache for everyone else.
--
-- Solution: per-item overrides, mirroring the pre-existing `custom_name`
-- column. Readers take `coalesce(items.custom_*, products.*)`. The
-- existing `items_update_members` RLS policy already covers writes.
--
-- Columns are nullable; null means "fall back to products.*".

alter table items
  add column custom_brand text,
  add column custom_category text;

-- We don't enforce `custom_category in (...valid keys)` at the DB level.
-- The valid key set lives in `src/lib/constants/categories.ts` and
-- evolves with the UI; coupling the constraint to the migration ledger
-- would force a schema push every time we add a category. The zod schema
-- at the action layer validates the enum instead.

comment on column items.custom_brand is
  'Per-item override for products.brand. Null means fall through to products.brand.';
comment on column items.custom_category is
  'Per-item override for products.category. Null means fall through to products.category. Values must match CategoryKey in src/lib/constants/categories.ts.';
