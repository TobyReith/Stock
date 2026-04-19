-- Phase 2.3: shopping list (Einkaufsliste).
--
-- One table, mirroring `items` structure: household-scoped, same
-- member-based RLS, optional product reference, per-item overrides for
-- the free-text case ("Bananen" — no barcode, no product row).
--
-- Design notes:
--   - `product_id` is optional. Most shopping-list entries are typed,
--     not scanned. When present it lets the "Gekauft → zum Vorrat" hand-
--     over pre-fill the Add-Flow with the known product.
--   - `custom_name` required iff no product is linked — enforced by a
--     check constraint so either path always yields something renderable.
--   - `bought_at` is a nullable timestamp, not a boolean. Null = "still
--     to buy", set = "gekauft am X". Keeps a cheap 7-day history on the
--     list page without a second table.
--   - `quantity` is nullable (unlike `items.quantity` which defaults to 1).
--     Rationale: a shopping list often has entries like "Käse" where
--     the quantity genuinely doesn't matter yet — forcing `1` there
--     would show misleading "1 Käse" on the list. Users who care type it.
--   - `added_by` follows the Phase 2.4 pattern (`on delete set null`) so
--     a user deleting their account doesn't cascade-kill shared list
--     entries.

create table shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  custom_name text,
  quantity numeric,
  unit text,
  note text,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  bought_at timestamptz,
  -- Either a product reference or a non-empty custom name (or both).
  -- Rules out "ghost" rows that have neither and would render as blank.
  check (
    product_id is not null
    or (custom_name is not null and length(trim(custom_name)) > 0)
  )
);

-- Hot path on `/shopping`: still-to-buy items, newest first.
create index idx_shopping_list_items_open
  on shopping_list_items (household_id, added_at desc)
  where bought_at is null;

-- Secondary index for the "zuletzt gekauft" section on the same page.
create index idx_shopping_list_items_bought
  on shopping_list_items (household_id, bought_at desc)
  where bought_at is not null;

-- ============================================================================
-- RLS
-- ============================================================================

alter table shopping_list_items enable row level security;

create policy "shopping_list_items_select_members"
  on shopping_list_items for select to authenticated
  using (public.is_household_member(household_id));

create policy "shopping_list_items_insert_members"
  on shopping_list_items for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and (added_by = auth.uid() or added_by is null)
  );

create policy "shopping_list_items_update_members"
  on shopping_list_items for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "shopping_list_items_delete_members"
  on shopping_list_items for delete to authenticated
  using (public.is_household_member(household_id));
