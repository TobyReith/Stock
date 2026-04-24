import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ExpiringItem, PantryItem, Recipe, UserRecipeSettings } from "./types";

const client = new Anthropic();

const SYSTEM_PROMPT = `Du bist ein erfahrener deutscher Hobbykoch.

Deine Aufgabe: Auf Basis der übergebenen Vorratsliste 2–3 Rezepte vorschlagen,
die möglichst viele der ABLAUFENDEN Zutaten verbrauchen.

REGELN:
- Ausschließlich metrische Einheiten (g, ml, EL, TL, Stk, Prise).
- Deutsche Küchenbegriffe (anbraten, ablöschen, unterheben, Pfanne, Backofen).
- Keine erfundenen Mengen für Zutaten, deren Menge bereits im Input angegeben ist.
- Bevorzuge Alltagsrezepte mit ≤ 30 Minuten Zubereitungszeit.
- Rezepte absteigend nach Anzahl der verwendeten ablaufenden Zutaten sortieren.
- Wenn Diätpräferenzen angegeben sind, STRIKT einhalten – kein optionales Weglassen.
- Wenn unverträgliche Zutaten angegeben sind, nie verwenden.
- Wenn Zutaten fehlen (feasibility: "limited"): max. 3 fehlende Zutaten benennen,
  nie mehr. Niemals ein Rezept vorschlagen, das fast ausschließlich aus Einkäufen besteht.
- Alle Rezepttitel und Schritte auf Deutsch.
- Antworte AUSSCHLIESSLICH über den Tool-Call.`;

const REPORT_RECIPES_TOOL: Anthropic.Tool = {
  name: "report_recipes",
  description: "Meldet die generierten Rezeptvorschläge strukturiert zurück.",
  input_schema: {
    type: "object" as const,
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title:       { type: "string" },
            description: { type: "string" },
            timeMinutes: { type: "number" },
            difficulty:  { type: "string", enum: ["einfach", "mittel", "anspruchsvoll"] },
            servings:    { type: "number" },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name:            { type: "string" },
                  amount:          { type: "number" },
                  unit:            { type: "string" },
                  isExpiringItem:  { type: "boolean" },
                  isInPantry:      { type: "boolean" },
                },
                required: ["name", "amount", "unit", "isExpiringItem", "isInPantry"],
              },
            },
            steps:              { type: "array", items: { type: "string" } },
            expiringItemsUsed:  { type: "array", items: { type: "string" } },
            dietaryCompliance:  { type: "array", items: { type: "string" } },
            feasibility:        { type: "string", enum: ["vollständig", "limited"] },
            limitedNote:        { type: "string" },
          },
          required: [
            "title", "description", "timeMinutes", "difficulty", "servings",
            "ingredients", "steps", "expiringItemsUsed", "dietaryCompliance", "feasibility",
          ],
        },
      },
    },
    required: ["recipes"],
  },
};

function buildUserPrompt(
  expiringItems: ExpiringItem[],
  pantryItems: PantryItem[],
  settings: UserRecipeSettings,
): string {
  const sortedExpiring = [...expiringItems].sort((a, b) => a.daysLeft - b.daysLeft);

  const expiringLines = sortedExpiring
    .map(
      (i) =>
        `- ${i.name}${i.brand ? ` (${i.brand})` : ""}, ${i.quantity} ${i.unit}, läuft in ${i.daysLeft} Tag${i.daysLeft === 1 ? "" : "en"} ab (ID: ${i.id})`,
    )
    .join("\n");

  const pantryLines = pantryItems
    .slice(0, 30)
    .map((i) => `- ${i.name} (${i.category})`)
    .join("\n");

  const dietary =
    settings.dietaryPreferences.length > 0
      ? settings.dietaryPreferences.join(", ")
      : "keine Einschränkungen";

  const disliked =
    settings.dislikedIngredients.length > 0
      ? settings.dislikedIngredients.join(", ")
      : "keine";

  return `ABLAUFENDE ZUTATEN (nach Dringlichkeit sortiert):
${expiringLines}

WEITERER VORRAT (Auszug):
${pantryLines || "– (leer)"}

DIÄT: ${dietary}
NICHT VERWENDEN: ${disliked}`;
}

export async function generateRecipes(
  expiringItems: ExpiringItem[],
  pantryItems: PantryItem[],
  settings: UserRecipeSettings,
): Promise<Recipe[]> {
  const userPrompt = buildUserPrompt(expiringItems, pantryItems, settings);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [REPORT_RECIPES_TOOL],
    tool_choice: { type: "tool", name: "report_recipes" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("LLM hat kein Tool-Ergebnis zurückgegeben");
  }

  const input = toolUse.input as { recipes: Recipe[] };
  return input.recipes ?? [];
}
