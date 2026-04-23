-- inventory_events: an immutable ledger of item lifecycle events.
-- Populated automatically via triggers on the items table.
-- Also serves the undo-flow (next feature): events link back to their
-- source item via item_id (SET NULL on delete so history survives cleanup).

create table inventory_events (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references households(id) on delete cascade,
  item_id      uuid        references items(id) on delete set null,
  type         text        not null check (type in ('added', 'consumed', 'discarded')),
  -- Snapshot fields — remain readable even if the item or product is deleted
  product_name text        not null,
  custom_name  text,
  category     text,
  location     text,
  quantity     numeric,
  unit         text,
  reason       text,             -- reserved for undo / correction context
  actor_id     uuid        references auth.users(id) on delete set null,
  happened_at  timestamptz not null default now()
);

create index inventory_events_household_happened
  on inventory_events (household_id, happened_at desc);

-- RLS -------------------------------------------------------------------------

alter table inventory_events enable row level security;

create policy "inventory_events_select"
  on inventory_events for select
  using (is_household_member(household_id));

-- Direct inserts are blocked; the trigger function (SECURITY DEFINER) writes
-- events instead. This keeps the ledger append-only from the client's view.
-- The undo feature (next sprint) will delete events through a server action
-- that uses the service role, not through RLS-guarded client inserts.

-- Trigger function ------------------------------------------------------------

create or replace function capture_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_category text;
begin
  -- Resolve product snapshot (may be null for manual-entry items)
  if NEW.product_id is not null then
    select name, category into v_name, v_category
    from products where id = NEW.product_id;
  end if;

  -- Prefer per-item overrides / custom fields over product defaults
  v_name     := coalesce(NEW.custom_name, v_name, 'Unbekannt');
  v_category := coalesce(NEW.custom_category, v_category);

  if TG_OP = 'INSERT' then
    insert into inventory_events
      (household_id, item_id, type, product_name, custom_name,
       category, location, quantity, unit, actor_id, happened_at)
    values
      (NEW.household_id, NEW.id, 'added', v_name, NEW.custom_name,
       v_category, NEW.location, NEW.quantity, NEW.unit,
       NEW.added_by, NEW.added_at);

  elsif TG_OP = 'UPDATE' then
    -- consumed_at: NULL → timestamp = consumed event
    if OLD.consumed_at is null and NEW.consumed_at is not null then
      insert into inventory_events
        (household_id, item_id, type, product_name, custom_name,
         category, location, quantity, unit, happened_at)
      values
        (NEW.household_id, NEW.id, 'consumed', v_name, NEW.custom_name,
         v_category, NEW.location, NEW.quantity, NEW.unit, NEW.consumed_at);
    end if;

    -- discarded_at: NULL → timestamp = discarded event
    if OLD.discarded_at is null and NEW.discarded_at is not null then
      insert into inventory_events
        (household_id, item_id, type, product_name, custom_name,
         category, location, quantity, unit, happened_at)
      values
        (NEW.household_id, NEW.id, 'discarded', v_name, NEW.custom_name,
         v_category, NEW.location, NEW.quantity, NEW.unit, NEW.discarded_at);
    end if;

    -- Undo: timestamp → NULL = remove the matching event
    if OLD.consumed_at is not null and NEW.consumed_at is null then
      delete from inventory_events
      where item_id = NEW.id and type = 'consumed';
    end if;

    if OLD.discarded_at is not null and NEW.discarded_at is null then
      delete from inventory_events
      where item_id = NEW.id and type = 'discarded';
    end if;
  end if;

  return NEW;
end;
$$;

create trigger items_capture_event
  after insert or update on items
  for each row execute function capture_item_event();

-- Backfill existing items ----------------------------------------------------

insert into inventory_events
  (household_id, item_id, type, product_name, custom_name,
   category, location, quantity, unit, actor_id, happened_at)
select
  i.household_id, i.id, 'added',
  coalesce(i.custom_name, p.name, 'Unbekannt'),
  i.custom_name,
  coalesce(i.custom_category, p.category),
  i.location, i.quantity, i.unit,
  i.added_by, i.added_at
from items i
left join products p on p.id = i.product_id
on conflict do nothing;

insert into inventory_events
  (household_id, item_id, type, product_name, custom_name,
   category, location, quantity, unit, happened_at)
select
  i.household_id, i.id, 'consumed',
  coalesce(i.custom_name, p.name, 'Unbekannt'),
  i.custom_name,
  coalesce(i.custom_category, p.category),
  i.location, i.quantity, i.unit,
  i.consumed_at
from items i
left join products p on p.id = i.product_id
where i.consumed_at is not null
on conflict do nothing;

insert into inventory_events
  (household_id, item_id, type, product_name, custom_name,
   category, location, quantity, unit, happened_at)
select
  i.household_id, i.id, 'discarded',
  coalesce(i.custom_name, p.name, 'Unbekannt'),
  i.custom_name,
  coalesce(i.custom_category, p.category),
  i.location, i.quantity, i.unit,
  i.discarded_at
from items i
left join products p on p.id = i.product_id
where i.discarded_at is not null
on conflict do nothing;
