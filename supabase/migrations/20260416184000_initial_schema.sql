-- Initial schema for Stock PWA
-- Tables: households, household_members, products, items, push_subscriptions
-- RLS: deny by default, explicit policies per table.
-- Security-definer helper functions avoid recursive RLS checks.

-- ============================================================================
-- Tables
-- ============================================================================

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  name text not null,
  brand text,
  category text,
  image_url text,
  off_data jsonb,
  source text not null check (source in ('openfoodfacts', 'manual', 'vision')),
  created_at timestamptz not null default now()
);

create index idx_products_barcode on products (barcode) where barcode is not null;

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  product_id uuid references products(id),
  custom_name text,
  quantity numeric not null default 1,
  unit text,
  best_before date not null,
  location text not null check (location in ('fridge', 'pantry', 'freezer', 'other')),
  note text,
  added_by uuid not null references auth.users(id),
  added_at timestamptz not null default now(),
  consumed_at timestamptz,
  discarded_at timestamptz,
  check (consumed_at is null or discarded_at is null)
);

create index idx_items_active_best_before
  on items (household_id, best_before)
  where consumed_at is null and discarded_at is null;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- RLS enable (deny-all until policies are added)
-- ============================================================================

alter table households enable row level security;
alter table household_members enable row level security;
alter table products enable row level security;
alter table items enable row level security;
alter table push_subscriptions enable row level security;

-- ============================================================================
-- Helper functions
-- security definer + fixed search_path lets policies consult membership
-- without recursing through RLS on household_members.
-- ============================================================================

create or replace function public.is_household_member(h_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = h_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(h_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = h_id and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.is_household_owner(uuid) from public;
grant  execute on function public.is_household_member(uuid) to authenticated;
grant  execute on function public.is_household_owner(uuid) to authenticated;

-- ============================================================================
-- Policies: households
-- ============================================================================

create policy "households_select_members"
  on households for select to authenticated
  using (public.is_household_member(id));

create policy "households_insert_self"
  on households for insert to authenticated
  with check (created_by = auth.uid());

create policy "households_update_owner"
  on households for update to authenticated
  using (public.is_household_owner(id))
  with check (public.is_household_owner(id));

create policy "households_delete_owner"
  on households for delete to authenticated
  using (public.is_household_owner(id));

-- ============================================================================
-- Policies: household_members
-- ============================================================================

create policy "household_members_select_peers"
  on household_members for select to authenticated
  using (public.is_household_member(household_id));

-- Creator of a household can bootstrap themselves as owner.
-- Adding other members (invites) goes through server actions with service_role.
create policy "household_members_insert_creator_bootstrap"
  on household_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.households
      where id = household_id and created_by = auth.uid()
    )
  );

-- Non-owners can leave (delete their own row). Owner removal goes via server action.
create policy "household_members_delete_self_leave"
  on household_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');

-- ============================================================================
-- Policies: products
-- Global cache: authenticated can read; writes only via service_role.
-- ============================================================================

create policy "products_select_authenticated"
  on products for select to authenticated
  using (true);

-- ============================================================================
-- Policies: items
-- ============================================================================

create policy "items_select_members"
  on items for select to authenticated
  using (public.is_household_member(household_id));

create policy "items_insert_members"
  on items for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and added_by = auth.uid()
  );

create policy "items_update_members"
  on items for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "items_delete_members"
  on items for delete to authenticated
  using (public.is_household_member(household_id));

-- ============================================================================
-- Policies: push_subscriptions
-- ============================================================================

create policy "push_subscriptions_all_self"
  on push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
