alter table products
  add column if not exists item_category_hint text
    check (item_category_hint in ('food', 'hygiene', 'medicine', 'other'));
