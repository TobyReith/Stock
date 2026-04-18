-- Track last-modified time on items so the list can offer an "Änderungs-
-- datum" sort.
--
-- `added_at` is creation time and doesn't move when the user adjusts
-- quantity / MHD / brand. Adding `updated_at` with a BEFORE UPDATE
-- trigger gives us a true last-touched timestamp that downstream
-- features (activity feeds, recently-changed sorts) can lean on too.
--
-- Default `now()` backfills existing rows to the migration time — not
-- technically accurate for their historical activity, but the only sane
-- bootstrap short of a large audit log.

alter table items
  add column updated_at timestamptz not null default now();

create or replace function items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- BEFORE UPDATE so the trigger wins over any client-supplied value.
create trigger items_set_updated_at
before update on items
for each row
execute function items_set_updated_at();

comment on column items.updated_at is
  'Last-modified time. Maintained by the items_set_updated_at trigger on UPDATE; initial value on INSERT matches added_at.';
