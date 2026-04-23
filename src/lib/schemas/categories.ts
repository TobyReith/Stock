import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(60, "Name zu lang"),
  icon: z.string().min(1).max(10).default("📦"),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Ungültige Farbe")
    .default("#6b7280"),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  icon: z.string().min(1).max(10).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Flat projection of a household category row used throughout the client UI.
 * Passed from server components as a plain JSON-serializable object.
 */
export type CategoryDisplay = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isSystem: boolean;
};

/** Emoji options shown in the icon picker. */
export const CATEGORY_ICONS = [
  "📦", "🧀", "🥩", "🥦", "🥫", "❄️", "🍝", "🫙", "🍞",
  "🧂", "🫒", "🍫", "🥤", "🥕", "🍎", "🥛", "🍳", "🌿",
  "🫐", "🍯", "🍕", "🧃", "☕", "🍜", "🥗", "🌶️", "🧁",
] as const;

/** Color palette shown in the color picker (tailwind-inspired). */
export const CATEGORY_COLORS: { label: string; value: string }[] = [
  { label: "Grau",    value: "#6b7280" },
  { label: "Rot",     value: "#ef4444" },
  { label: "Orange",  value: "#f97316" },
  { label: "Gelb",    value: "#eab308" },
  { label: "Grün",    value: "#22c55e" },
  { label: "Limette", value: "#84cc16" },
  { label: "Himmel",  value: "#0ea5e9" },
  { label: "Blau",    value: "#3b82f6" },
  { label: "Cyan",    value: "#06b6d4" },
  { label: "Violett", value: "#a855f7" },
  { label: "Pink",    value: "#ec4899" },
  { label: "Amber",   value: "#d97706" },
];
