-- Add parent_category to categories table.
-- Existing rows are all food-related; the DEFAULT 'food' covers them automatically.

ALTER TABLE categories
  ADD COLUMN parent_category text NOT NULL DEFAULT 'food'
    CHECK (parent_category IN ('food', 'hygiene', 'medicine', 'other'));
