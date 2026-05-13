-- Store category directly on shopping list items so that items without
-- an OFF product link can still be grouped correctly, and so the user
-- can override the category from the detail sheet.
ALTER TABLE shopping_list_items
  ADD COLUMN category text NULL;
