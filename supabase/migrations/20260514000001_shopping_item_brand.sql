-- Store brand directly on shopping list items so that manually-entered
-- stock items (no OFF product link, product_id IS NULL) still carry their
-- brand through to the shopping list.
ALTER TABLE shopping_list_items
  ADD COLUMN brand text NULL;
