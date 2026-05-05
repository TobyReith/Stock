-- Custom Categories Feature
-- Household-scoped category registry; system categories are seeded and un-deletable.

-- 1. Table
CREATE TABLE categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 60),
  icon         TEXT        NOT NULL DEFAULT '📦',
  color        TEXT        NOT NULL DEFAULT '#6b7280',
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_system    BOOLEAN     NOT NULL DEFAULT false,
  slug         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, slug)
);

-- 2. RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (is_household_member(household_id));

-- Users can only insert custom (non-system) categories for their own household
CREATE POLICY "categories_insert" ON categories
  FOR INSERT WITH CHECK (
    is_household_member(household_id) AND NOT is_system
  );

-- Users can rename / recolor / reorder any category they can see
CREATE POLICY "categories_update" ON categories
  FOR UPDATE USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

-- Users can only delete custom categories
CREATE POLICY "categories_delete" ON categories
  FOR DELETE USING (
    is_household_member(household_id) AND NOT is_system
  );

-- 3. Seed function (SECURITY DEFINER → runs as postgres, bypasses RLS)
CREATE OR REPLACE FUNCTION seed_household_categories(p_household_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO categories (household_id, name, icon, color, sort_order, is_system, slug)
  VALUES
    (p_household_id, 'Milch & Käse',     '🧀', '#3b82f6', 1,  true, 'dairy'),
    (p_household_id, 'Fleisch & Fisch',  '🥩', '#ef4444', 2,  true, 'meat_fish'),
    (p_household_id, 'Obst & Gemüse',    '🥦', '#22c55e', 3,  true, 'produce'),
    (p_household_id, 'Tiefkühl',         '❄️', '#0ea5e9', 4,  true, 'frozen'),
    (p_household_id, 'Konserven',        '🥫', '#f97316', 5,  true, 'canned'),
    (p_household_id, 'Nudeln & Reis',    '🍝', '#eab308', 6,  true, 'dry_pasta_rice'),
    (p_household_id, 'Mehl & Zucker',    '🫙', '#a855f7', 7,  true, 'dry_baking'),
    (p_household_id, 'Brot & Backwaren', '🍞', '#d97706', 8,  true, 'bread'),
    (p_household_id, 'Gewürze',          '🧂', '#78716c', 9,  true, 'spices'),
    (p_household_id, 'Saucen & Öl',      '🫒', '#84cc16', 10, true, 'condiments'),
    (p_household_id, 'Snacks & Süßes',   '🍫', '#ec4899', 11, true, 'snacks'),
    (p_household_id, 'Getränke',         '🥤', '#06b6d4', 12, true, 'beverages'),
    (p_household_id, 'Sonstiges',        '📦', '#6b7280', 13, true, 'other')
  ON CONFLICT (household_id, slug) DO NOTHING;
END;
$$;

-- 4. Trigger: auto-seed on new household
CREATE OR REPLACE FUNCTION trigger_seed_household_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM seed_household_categories(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER after_household_insert
  AFTER INSERT ON households
  FOR EACH ROW EXECUTE FUNCTION trigger_seed_household_categories();

-- 5. Seed all existing households
DO $$
DECLARE
  h RECORD;
BEGIN
  FOR h IN SELECT id FROM households LOOP
    PERFORM seed_household_categories(h.id);
  END LOOP;
END;
$$;
