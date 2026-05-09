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

const INSPIRATION_SYSTEM_PROMPT = `Du bist ein erfahrener deutscher Hobbykoch.

Deine Aufgabe: Auf Basis des vorhandenen Vorrats kreative Rezeptideen vorschlagen.
Es gibt keine dringend ablaufenden Zutaten – nutze, was im Vorrat ist.

REGELN:
- Ausschließlich metrische Einheiten (g, ml, EL, TL, Stk, Prise).
- Deutsche Küchenbegriffe (anbraten, ablöschen, unterheben, Pfanne, Backofen).
- Wenn Diätpräferenzen angegeben sind, STRIKT einhalten – kein optionales Weglassen.
- Wenn unverträgliche Zutaten angegeben sind, nie verwenden.
- Wenn Zutaten fehlen (feasibility: "limited"): max. 3 fehlende Zutaten benennen.
- Niemals ein Rezept vorschlagen, das fast ausschließlich aus Einkäufen besteht.
- Wenn BEREITS GEKOCHTE / GESPEICHERTE REZEPTE angegeben sind: diese Titel NICHT wiederholen.
  Schlage stattdessen thematisch ähnliche, aber neue Variationen vor.
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

function buildInspirationPrompt(
  pantryItems: PantryItem[],
  settings: UserRecipeSettings,
  recentTitles: string[],
): string {
  const pantryLines = pantryItems
    .slice(0, 40)
    .map((i) => `- ${i.name} (${i.category}), ${i.quantity} ${i.unit}`)
    .join("\n");

  const dietary =
    settings.dietaryPreferences.length > 0
      ? settings.dietaryPreferences.join(", ")
      : "keine Einschränkungen";

  const disliked =
    settings.dislikedIngredients.length > 0
      ? settings.dislikedIngredients.join(", ")
      : "keine";

  const recentBlock =
    recentTitles.length > 0
      ? `\nBEREITS GEKOCHT / GESPEICHERT (NICHT wiederholen):\n${recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "";

  return `VORRAT:
${pantryLines || "– (leer)"}

DIÄT: ${dietary}
NICHT VERWENDEN: ${disliked}${recentBlock}`;
}

export async function generateRecipes(
  expiringItems: ExpiringItem[],
  pantryItems: PantryItem[],
  settings: UserRecipeSettings,
  options?: { inspiration?: boolean; recentTitles?: string[] },
): Promise<Recipe[]> {
  const inspiration = options?.inspiration ?? false;
  const userPrompt = inspiration
    ? buildInspirationPrompt(pantryItems, settings, options?.recentTitles ?? [])
    : buildUserPrompt(expiringItems, pantryItems, settings);

  const systemPrompt = inspiration ? INSPIRATION_SYSTEM_PROMPT : SYSTEM_PROMPT;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
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
