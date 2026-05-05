-- Storage locations table: household-scoped, supports system and custom locations.
-- Analogous to categories. Items continue to reference locations by slug (string).

create table storage_locations (
  id              uuid        primary key default gen_random_uuid(),
  household_id    uuid        not null references households(id) on delete cascade,
  name            text        not null check (char_length(name) between 1 and 60),
  icon            text        not null default '📦',
  slug            text        not null check (slug ~ '^[a-z0-9_]{1,80}$'),
  sort_order      integer     not null default 0,
  is_system       boolean     not null default false,
  temperature_hint text       not null default 'ambient'
                              check (temperature_hint in ('cold', 'frozen', 'ambient')),
  created_at      timestamptz not null default now(),
  unique (household_id, slug)
);

-- RLS -------------------------------------------------------------------------

alter table storage_locations enable row level security;

-- Any household member can read the household's locations
create policy "storage_locations_select_members"
  on storage_locations for select
  using (is_household_member(household_id));

-- Members can create custom locations in their household
create policy "storage_locations_insert_members"
  on storage_locations for insert
  with check (
    is_household_member(household_id) and not is_system
  );

-- Members can update any location (rename system locations too)
create policy "storage_locations_update_members"
  on storage_locations for update
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- Members can only delete custom locations
create policy "storage_locations_delete_custom"
  on storage_locations for delete
  using (is_household_member(household_id) and not is_system);

-- Seed function ---------------------------------------------------------------

-- SECURITY DEFINER bypasses RLS so it can insert is_system = true rows
-- on behalf of users who can't do so directly.
create or replace function seed_household_storage_locations(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into storage_locations (household_id, slug, name, icon, sort_order, is_system, temperature_hint)
  values
    (p_household_id, 'fridge',        'Kühlschrank',    '🧊', 1, true, 'cold'),
    (p_household_id, 'freezer',       'Gefrierschrank', '❄️', 2, true, 'frozen'),
    (p_household_id, 'pantry',        'Vorratsschrank', '📦', 3, true, 'ambient'),
    (p_household_id, 'larder',        'Speisekammer',   '🏠', 4, true, 'ambient'),
    (p_household_id, 'fruit_basket',  'Obstkorb',       '🍎', 5, true, 'ambient'),
    (p_household_id, 'drinks',        'Getränkelager',  '🥤', 6, true, 'ambient'),
    (p_household_id, 'other',         'Sonstiges',      '📋', 7, true, 'ambient')
  on conflict (household_id, slug) do nothing;
end;
$$;

-- Trigger: seed new households automatically
create or replace function trigger_seed_household_storage_locations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_household_storage_locations(new.id);
  return new;
end;
$$;

create trigger after_household_insert_seed_storage_locations
  after insert on households
  for each row execute function trigger_seed_household_storage_locations();

-- Seed all existing households
do $$
declare
  hid uuid;
begin
  for hid in select id from households loop
    perform seed_household_storage_locations(hid);
  end loop;
end;
$$;

-- Drop the hard-coded CHECK constraint on items.location so any slug is valid -

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'items'::regclass
    and contype = 'c'
    and conname like '%location%';
  if cname is not null then
    execute format('alter table items drop constraint %I', cname);
  end if;
end;
$$;
