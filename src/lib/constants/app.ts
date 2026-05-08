/**
 * App-wide numeric constants.
 *
 * Centralised here so thresholds that appear in multiple layers
 * (server actions, server components, client components) stay in sync.
 */

/** Days before expiry at which an item is considered "soon" in the MHD urgency buckets. */
export const MHD_SOON_DAYS = 3;

/** Days-ahead window used for the expiry widget on the main list and for recipe generation. */
export const EXPIRY_THRESHOLD_DAYS = 5;

/** Maximum LLM-backed recipe-generation calls per household per calendar day. */
export const DAILY_RECIPE_QUOTA = 10;

/** Maximum number of pantry items sent to the recipe LLM as context. */
export const RECIPE_PANTRY_LIMIT = 40;

/** Hours a recipe-suggestion result is cached before the LLM is called again. */
export const RECIPE_CACHE_TTL_HOURS = 24;
