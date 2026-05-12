-- Extend seed_household_categories() with hygiene and medicine subcategories,
-- then re-seed all existing households (idempotent via ON CONFLICT DO NOTHING).

CREATE OR REPLACE FUNCTION seed_household_categories(p_household_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO categories (household_id, name, icon, color, sort_order, is_system, slug, parent_category)
  VALUES
    -- Food (unchanged)
    (p_household_id, 'Milch & Käse',              '🧀', '#3b82f6', 1,  true, 'dairy',          'food'),
    (p_household_id, 'Fleisch & Fisch',            '🥩', '#ef4444', 2,  true, 'meat_fish',      'food'),
    (p_household_id, 'Obst & Gemüse',              '🥦', '#22c55e', 3,  true, 'produce',        'food'),
    (p_household_id, 'Tiefkühl',                   '❄️', '#0ea5e9', 4,  true, 'frozen',         'food'),
    (p_household_id, 'Konserven',                  '🥫', '#f97316', 5,  true, 'canned',         'food'),
    (p_household_id, 'Nudeln & Reis',              '🍝', '#eab308', 6,  true, 'dry_pasta_rice', 'food'),
    (p_household_id, 'Mehl & Zucker',              '🫙', '#a855f7', 7,  true, 'dry_baking',     'food'),
    (p_household_id, 'Brot & Backwaren',           '🍞', '#d97706', 8,  true, 'bread',          'food'),
    (p_household_id, 'Gewürze',                    '🧂', '#78716c', 9,  true, 'spices',         'food'),
    (p_household_id, 'Saucen & Öl',                '🫒', '#84cc16', 10, true, 'condiments',     'food'),
    (p_household_id, 'Snacks & Süßes',             '🍫', '#ec4899', 11, true, 'snacks',         'food'),
    (p_household_id, 'Getränke',                   '🥤', '#06b6d4', 12, true, 'beverages',      'food'),
    (p_household_id, 'Sonstiges',                  '📦', '#6b7280', 13, true, 'other',          'food'),
    -- Hygiene
    (p_household_id, 'Dusche & Bad',               '🚿', '#0ea5e9', 14, true, 'dusche_bad',     'hygiene'),
    (p_household_id, 'Haarpflege',                 '🧴', '#a855f7', 15, true, 'haarpflege',     'hygiene'),
    (p_household_id, 'Mundpflege',                 '🪥', '#22c55e', 16, true, 'mundpflege',     'hygiene'),
    (p_household_id, 'Hautpflege',                 '💆', '#ec4899', 17, true, 'hautpflege',     'hygiene'),
    (p_household_id, 'Damenhygiene',               '🌸', '#f97316', 18, true, 'damenhygiene',   'hygiene'),
    (p_household_id, 'Rasur',                      '🪒', '#3b82f6', 19, true, 'rasur',          'hygiene'),
    (p_household_id, 'Babypflege',                 '👶', '#eab308', 20, true, 'babypflege',     'hygiene'),
    (p_household_id, 'Desinfektionsmittel',        '🧫', '#ef4444', 21, true, 'desinfektion',   'hygiene'),
    (p_household_id, 'Toilettenpapier & Papierwaren','🧻','#84cc16', 22, true, 'papierprodukte', 'hygiene'),
    (p_household_id, 'Sonstiges',                  '📦', '#6b7280', 23, true, 'hygiene_sonstiges', 'hygiene'),
    -- Medicine
    (p_household_id, 'Schmerzmittel',              '💊', '#ef4444', 24, true, 'schmerzmittel',   'medicine'),
    (p_household_id, 'Erkältung & Grippe',         '🤧', '#0ea5e9', 25, true, 'erkaeltung',      'medicine'),
    (p_household_id, 'Magen & Verdauung',          '🫁', '#eab308', 26, true, 'magen_verdauung', 'medicine'),
    (p_household_id, 'Allergie',                   '🌿', '#22c55e', 27, true, 'allergie',        'medicine'),
    (p_household_id, 'Wundversorgung',             '🩹', '#f97316', 28, true, 'wundversorgung',  'medicine'),
    (p_household_id, 'Vitamine & Nahrungsergänzung','💪','#a855f7', 29, true, 'vitamine',        'medicine'),
    (p_household_id, 'Augen & Ohren',              '👁', '#06b6d4', 30, true, 'augen_ohren',     'medicine'),
    (p_household_id, 'Dauermedikation',            '📋', '#3b82f6', 31, true, 'dauermedikation', 'medicine'),
    (p_household_id, 'Homöopathie & Naturheilmittel','🌱','#84cc16', 32, true, 'homoeopathie',   'medicine'),
    (p_household_id, 'Sonstiges',                  '📦', '#6b7280', 33, true, 'medizin_sonstiges','medicine')
  ON CONFLICT (household_id, slug) DO NOTHING;
END;
$$;

-- Re-seed all existing households (new rows only; ON CONFLICT skips existing food rows).
DO $$
DECLARE
  h RECORD;
BEGIN
  FOR h IN SELECT id FROM households LOOP
    PERFORM seed_household_categories(h.id);
  END LOOP;
END;
$$;
