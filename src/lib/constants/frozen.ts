import type { CategoryKey } from "./categories";

export const FROZEN_SHELF_LIFE_DAYS: Partial<Record<CategoryKey, number>> = {
  meat_fish:      270,
  produce:        365,
  dairy:          90,
  bread:          90,
  dry_pasta_rice: 180,
  dry_baking:     90,
  frozen:         180,
  spices:         365,
};

export const FROZEN_DEFAULT_DAYS = 90;

export function frozenShelfLifeDays(category: string | null | undefined): number {
  return FROZEN_SHELF_LIFE_DAYS[category as CategoryKey] ?? FROZEN_DEFAULT_DAYS;
}
