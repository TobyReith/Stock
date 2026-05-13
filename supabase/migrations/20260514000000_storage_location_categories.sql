-- Junction table: assigns storage locations to top-level item categories.
-- A location with no rows here is a universal fallback (shown for all categories).

CREATE TABLE storage_location_categories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_location_id uuid NOT NULL
    REFERENCES storage_locations(id) ON DELETE CASCADE,
  category            text NOT NULL
    CHECK (category IN ('food', 'hygiene', 'medicine', 'other')),
  UNIQUE (storage_location_id, category)
);

ALTER TABLE storage_location_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slc_select_members" ON storage_location_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM storage_locations sl
      WHERE sl.id = storage_location_id
        AND is_household_member(sl.household_id)
    )
  );

CREATE POLICY "slc_insert_members" ON storage_location_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM storage_locations sl
      WHERE sl.id = storage_location_id
        AND is_household_member(sl.household_id)
    )
  );

CREATE POLICY "slc_delete_members" ON storage_location_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM storage_locations sl
      WHERE sl.id = storage_location_id
        AND is_household_member(sl.household_id)
    )
  );

-- Extend the seed function to also insert the two new system locations.
-- We recreate the function so new households get them automatically.
CREATE OR REPLACE FUNCTION seed_household_storage_locations(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO storage_locations (household_id, slug, name, icon, sort_order, is_system, temperature_hint)
  VALUES
    (p_household_id, 'fridge',            'Kühlschrank',   '🧊', 1, true, 'cold'),
    (p_household_id, 'freezer',           'Gefrierschrank','❄️', 2, true, 'frozen'),
    (p_household_id, 'pantry',            'Vorratsschrank','📦', 3, true, 'ambient'),
    (p_household_id, 'larder',            'Speisekammer',  '🏠', 4, true, 'ambient'),
    (p_household_id, 'fruit_basket',      'Obstkorb',      '🍎', 5, true, 'ambient'),
    (p_household_id, 'drinks',            'Getränkelager', '🥤', 6, true, 'ambient'),
    (p_household_id, 'other',             'Sonstiges',     '📋', 7, true, 'ambient'),
    (p_household_id, 'medicine_cabinet',  'Arzneischrank', '💊', 8, true, 'ambient'),
    (p_household_id, 'bathroom_cabinet',  'Badschrank',    '🛁', 9, true, 'ambient')
  ON CONFLICT (household_id, slug) DO NOTHING;
END;
$$;

-- Seed default category assignments for a household.
-- Locations with no assignments are universal fallbacks (shown for all categories).
CREATE OR REPLACE FUNCTION seed_storage_location_categories(p_household_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- fridge → food, hygiene, medicine
  INSERT INTO storage_location_categories (storage_location_id, category)
  SELECT sl.id, c.category
  FROM storage_locations sl
  CROSS JOIN (VALUES ('food'), ('hygiene'), ('medicine')) AS c(category)
  WHERE sl.household_id = p_household_id AND sl.slug = 'fridge'
  ON CONFLICT DO NOTHING;

  -- freezer, pantry, larder, fruit_basket, drinks → food only
  INSERT INTO storage_location_categories (storage_location_id, category)
  SELECT sl.id, 'food'
  FROM storage_locations sl
  WHERE sl.household_id = p_household_id
    AND sl.slug IN ('freezer', 'pantry', 'larder', 'fruit_basket', 'drinks')
  ON CONFLICT DO NOTHING;

  -- medicine_cabinet → medicine
  INSERT INTO storage_location_categories (storage_location_id, category)
  SELECT sl.id, 'medicine'
  FROM storage_locations sl
  WHERE sl.household_id = p_household_id AND sl.slug = 'medicine_cabinet'
  ON CONFLICT DO NOTHING;

  -- bathroom_cabinet → hygiene, medicine
  INSERT INTO storage_location_categories (storage_location_id, category)
  SELECT sl.id, c.category
  FROM storage_locations sl
  CROSS JOIN (VALUES ('hygiene'), ('medicine')) AS c(category)
  WHERE sl.household_id = p_household_id AND sl.slug = 'bathroom_cabinet'
  ON CONFLICT DO NOTHING;
END;
$$;

-- Hook: seed categories after seeding locations for new households
CREATE OR REPLACE FUNCTION trigger_seed_household_storage_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_household_storage_locations(new.id);
  PERFORM seed_storage_location_categories(new.id);
  RETURN new;
END;
$$;

-- Seed new locations + categories for all existing households
DO $$
DECLARE
  hid uuid;
BEGIN
  FOR hid IN SELECT id FROM households LOOP
    PERFORM seed_household_storage_locations(hid);
    PERFORM seed_storage_location_categories(hid);
  END LOOP;
END;
$$;
