import { z } from "zod";

export type TemperatureHint = "cold" | "frozen" | "ambient";

export type StorageLocationDisplay = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder: number;
  isSystem: boolean;
  temperatureHint: TemperatureHint;
};

export const TEMPERATURE_HINT_LABELS: Record<TemperatureHint, string> = {
  cold: "Kühl (~4 °C)",
  frozen: "Tiefgekühlt (−18 °C)",
  ambient: "Raumtemperatur",
};

export const STORAGE_LOCATION_ICONS = [
  "🧊", "❄️", "📦", "🏠", "🍎", "🥤", "📋", "🥩", "🥗", "🥦",
  "🍞", "🧃", "🍷", "🫙", "🧴", "🛒", "🏺", "📫", "🪣", "🗄️",
] as const;

export const createStorageLocationSchema = z.object({
  name: z.string().min(1, "Name fehlt").max(60),
  icon: z.string().min(1),
  temperatureHint: z.enum(["cold", "frozen", "ambient"]).default("ambient"),
});

export const updateStorageLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60).optional(),
  icon: z.string().min(1).optional(),
  temperatureHint: z.enum(["cold", "frozen", "ambient"]).optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateStorageLocationInput = z.infer<typeof createStorageLocationSchema>;
export type UpdateStorageLocationInput = z.infer<typeof updateStorageLocationSchema>;
