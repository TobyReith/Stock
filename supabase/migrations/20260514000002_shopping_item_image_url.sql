-- Store image_url directly on shopping list items so that manually-entered
-- stock items (no OFF product link, product_id IS NULL) still carry their
-- product image through to the shopping list.
ALTER TABLE shopping_list_items
  ADD COLUMN image_url text NULL;
