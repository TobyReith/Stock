ALTER TABLE shopping_list_items ADD COLUMN item_category text NULL CHECK (item_category IN ('food', 'hygiene', 'medicine', 'other'));
