alter table items add column frozen_at date;

comment on column items.frozen_at is
  'Date the item was put in the freezer. Null means not frozen. Setting this also updates best_before and location (handled at the action layer).';
