alter table items
  add column item_category text not null default 'food'
    constraint items_item_category_check check (item_category in ('food', 'hygiene', 'medicine', 'other')),
  add column item_metadata jsonb;

comment on column items.item_category is
  'Top-level item type for tab-based filtering: food, hygiene, medicine, other.';

comment on column items.item_metadata is
  'Reserved JSONB blob for future category-specific fields (e.g. dosage for medicine).';
