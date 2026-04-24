import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  VisionProviderError,
  type ExtractedDate,
  type ProductCandidate,
  type ProductIdentificationResult,
  type VisionInput,
  type VisionProvider,
  type VisionResult,
} from "./types";

/**
 * Anthropic Claude Sonnet implementation of {@link VisionProvider}.
 *
 * Why Sonnet 4.5 specifically: it's the smallest tier where vision +
 * tool-use reliably produces structured output for low-quality phone snaps
 * of crumpled / glossy packaging. Haiku skips dates more often; Opus is
 * overkill at ~6× the cost.
 *
 * The system prompt + tool definition are marked with `cache_control:
 * "ephemeral"` so consecutive scans within the 5-minute cache TTL pay
 * only image tokens, not the static instructions.
 */

const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 512;

const TOOL_NAME = "report_best_before_date";

// Singleton — instantiation is cheap but pointless to repeat.
let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new VisionProviderError("anthropic", "ANTHROPIC_API_KEY fehlt");
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

const SYSTEM_PROMPT = `Du bist ein präzises OCR-System für deutschsprachige Lebensmittelverpackungen.

Deine Aufgabe: Das Mindesthaltbarkeitsdatum (MHD) aus dem Bild lesen und über das Tool \`${TOOL_NAME}\` zurückmelden.

ERKENNUNGSREGELN:
- Bevorzuge Text mit Markern: "MHD", "Mindesthaltbarkeitsdatum", "mindestens haltbar bis", "Verbrauchen bis", "best before", "BBE", "exp", "use by".
- IGNORIERE Produktionsdaten ("hergestellt am", "produziert", "Charge", "LOT", "L:", reine Batch-Nummern).
- Wenn mehrere plausible MHD-Kandidaten vorhanden sind: nimm das spätere (MHD liegt in der Zukunft).
- Akzeptierte Formate: DD.MM.YYYY, DD.MM.YY, DD/MM/YYYY, MM.YYYY, MM/YYYY, MM-YYYY.
- Bei reinem Monatsformat (z.B. "12.2026"): \`precision: "month"\`, \`day\` = letzter Tag dieses Monats. Sonst \`precision: "day"\`.
- Zweistellige Jahre (YY): wenn YY < 50 → 20YY, sonst 19YY.

CONFIDENCE-SKALA:
- 0.95–1.00: Datum direkt neben einem MHD-Marker, Schrift klar lesbar.
- 0.70–0.94: Datum lesbar, Marker fehlt aber kontextuell wahrscheinlich (z.B. einziges Datum auf Etikett).
- 0.30–0.69: Datum schwer lesbar oder mehrdeutig.
- < 0.30: nicht zurückmelden — stattdessen \`found: false\`.

WENN KEIN MHD GEFUNDEN: rufe das Tool mit \`found: false\` auf und setze \`raw_text\` auf einen kurzen Hinweis, was zu sehen war.

Antworte AUSSCHLIESSLICH über den Tool-Call, kein Fließtext.`;

const TOOL_DEFINITION = {
  name: TOOL_NAME,
  description: "Meldet das aus dem Bild extrahierte Mindesthaltbarkeitsdatum.",
  input_schema: {
    type: "object" as const,
    properties: {
      found: {
        type: "boolean",
        description: "true wenn ein MHD eindeutig identifiziert werden konnte.",
      },
      year: { type: "integer", minimum: 2000, maximum: 2099 },
      month: { type: "integer", minimum: 1, maximum: 12 },
      day: { type: "integer", minimum: 1, maximum: 31 },
      precision: {
        type: "string",
        enum: ["day", "month"],
        description: "'month' wenn nur MM.YYYY auf dem Etikett stand.",
      },
      raw_text: {
        type: "string",
        description: "Verbatim-Text wie auf dem Etikett, oder kurzer Grund bei found=false.",
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      ambiguity_note: {
        type: "string",
        description: "Optional: Hinweis bei mehrdeutigen Funden.",
      },
    },
    required: ["found", "confidence", "raw_text"],
  },
};

type ToolInput = {
  found: boolean;
  year?: number;
  month?: number;
  day?: number;
  precision?: "day" | "month";
  raw_text: string;
  confidence: number;
  ambiguity_note?: string;
};

/** Last day of a given (1-indexed) month; safe for leap years. */
function lastDayOfMonth(year: number, month: number): number {
  // `new Date(year, month, 0)` returns the 0th day of next month = last day of `month`.
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toResult(input: ToolInput): VisionResult {
  if (!input.found) {
    return { ok: false, reason: "not_found", detail: input.raw_text };
  }
  if (input.confidence < 0.3) {
    return { ok: false, reason: "not_found", detail: input.raw_text };
  }
  if (input.ambiguity_note && input.confidence < 0.6) {
    return { ok: false, reason: "ambiguous", detail: input.ambiguity_note };
  }
  if (!input.year || !input.month) {
    return { ok: false, reason: "unparseable", detail: "Jahr/Monat fehlt" };
  }

  const precision = input.precision ?? "day";
  const day =
    precision === "month"
      ? lastDayOfMonth(input.year, input.month)
      : input.day ?? lastDayOfMonth(input.year, input.month);

  // Sanity: refuse dates more than 10 years in the future (likely OCR slip).
  const isoYear = input.year;
  const now = new Date();
  if (isoYear > now.getFullYear() + 10) {
    return { ok: false, reason: "unparseable", detail: `Jahr ${isoYear} unplausibel` };
  }

  const value: ExtractedDate = {
    date: `${isoYear}-${pad2(input.month)}-${pad2(day)}`,
    confidence: input.confidence,
    raw: input.raw_text,
    precision,
  };
  return { ok: true, value };
}

// ─── Product Identification ───────────────────────────────────────────────────

const PRODUCT_TOOL_NAME = "report_product";

const PRODUCT_SYSTEM_PROMPT = `Du bist ein Produkterkennungs-System für Lebensmittelverpackungen.

Deine Aufgabe: Das Produkt auf dem Foto identifizieren und über das Tool \`${PRODUCT_TOOL_NAME}\` melden.

ERKENNUNGSREGELN:
- Lies den Produktnamen von der Verpackung (Hauptbezeichnung, keine Werbetexte).
- Marke/Hersteller: Firmenname auf der Verpackung (z.B. Milka, Müller, Dr. Oetker).
- Kategorie: Wähle eine aus: dairy | meat_fish | produce | frozen | canned | dry_pasta_rice | dry_baking | bread | spices | condiments | snacks | beverages | other
- Bis zu 3 Kandidaten absteigend nach Konfidenz, falls du unsicher bist.
- Erkenne auch Produkte in anderen Sprachen.

CONFIDENCE-SKALA:
- 0.90–1.00: Name + Marke klar lesbar.
- 0.70–0.89: Name lesbar, Marke unklar oder teilweise verdeckt.
- 0.40–0.69: Nur Teilinformationen erkennbar.
- < 0.40: Nicht zurückmelden.

WENN KEIN PRODUKT ERKENNBAR: \`candidates: []\`

Antworte AUSSCHLIESSLICH über den Tool-Call, kein Fließtext.`;

const PRODUCT_TOOL_DEFINITION = {
  name: PRODUCT_TOOL_NAME,
  description: "Meldet die aus dem Foto erkannten Produkt-Kandidaten.",
  input_schema: {
    type: "object" as const,
    properties: {
      candidates: {
        type: "array",
        description: "Erkannte Kandidaten, absteigend nach Konfidenz (max. 3).",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Produktname wie auf Verpackung." },
            brand: { type: "string", description: "Marke/Hersteller." },
            category: {
              type: "string",
              enum: ["dairy", "meat_fish", "produce", "frozen", "canned", "dry_pasta_rice", "dry_baking", "bread", "spices", "condiments", "snacks", "beverages", "other"],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["name", "category", "confidence"],
        },
      },
    },
    required: ["candidates"],
  },
};

type ProductToolInput = {
  candidates: Array<{
    name: string;
    brand?: string;
    category: string;
    confidence: number;
  }>;
};

export async function identifyProduct(input: VisionInput): Promise<ProductIdentificationResult> {
  const client = getClient();

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: PRODUCT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [PRODUCT_TOOL_DEFINITION],
      tool_choice: { type: "tool", name: PRODUCT_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mimeType,
                data: input.base64,
              },
            },
            { type: "text", text: "Bitte das Produkt auf dieser Verpackung identifizieren." },
          ],
        },
      ],
    });
  } catch (err) {
    throw new VisionProviderError(
      "anthropic",
      err instanceof Error ? err.message : "Anthropic API Fehler",
      { cause: err },
    );
  }

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return { ok: false, reason: "unparseable" };
  }

  const raw = toolBlock.input as ProductToolInput;
  const candidates: ProductCandidate[] = (raw.candidates ?? [])
    .filter((c) => c.confidence >= 0.4)
    .slice(0, 3)
    .map((c) => ({
      name: c.name,
      brand: c.brand ?? null,
      category: c.category,
      confidence: c.confidence,
      source: "vision" as const,
    }));

  return { ok: true, candidates };
}

// ─── MHD Provider ────────────────────────────────────────────────────────────

export const anthropicVisionProvider: VisionProvider = {
  id: "anthropic-claude-sonnet-4-5",

  async extractBestBeforeDate(input: VisionInput): Promise<VisionResult> {
    const client = getClient();

    let response: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // System prompt is static across calls → cache it. Saves ~700 input
        // tokens per scan after the first within the 5-min TTL window.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        // Force the model to emit through our tool — no free-text fallback.
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: input.mimeType,
                  data: input.base64,
                },
              },
              {
                type: "text",
                text: "Bitte das MHD von diesem Etikett auslesen.",
              },
            ],
          },
        ],
      });
    } catch (err) {
      throw new VisionProviderError(
        "anthropic",
        err instanceof Error ? err.message : "Anthropic API Fehler",
        { cause: err },
      );
    }

    // Find the tool_use block — there should be exactly one given tool_choice.
    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return { ok: false, reason: "unparseable", detail: "Keine Tool-Antwort vom Modell" };
    }

    const raw = toolBlock.input as ToolInput;
    return toResult(raw);
  },
};
