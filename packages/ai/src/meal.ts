import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { getClaudeClient } from "./claude";
import { modelRouter } from "./modelRouter";
import { withAiTask } from "./tracing";
import type { VisionMediaType } from "./style/vision";
import { zodOutput } from "./zodOutput";

// Phase 3.2 — meal parsing. The model's ONLY job is to split what the client
// said/photographed into {name, qty, unit} items. It never picks a food id and
// never emits a calorie: resolution against the foods table (searchFoods) and
// all macro math happen in code downstream (CLAUDE.md rule 4). Text and photo
// paths return the SAME shape so they share one resolve + confirm pipeline.

export const ParsedMealItemSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .describe("The food name ONLY, no quantities — e.g. 'roti', 'dal', 'chicken breast'."),
  qty: z
    .number()
    .positive()
    .max(100)
    .describe("How many/much. Use 1 when the client didn't say a number."),
  unit: z
    .string()
    .max(24)
    .nullable()
    .describe(
      "The unit or count word exactly as expressed — 'rotis', 'katori', 'cup', 'bowl', 'g', 'plate'. null if none was given.",
    ),
});

export const ParsedMealSchema = z.object({
  items: z.array(ParsedMealItemSchema).max(20),
});

export type ParsedMealItem = z.infer<typeof ParsedMealItemSchema>;
export type ParsedMeal = z.infer<typeof ParsedMealSchema>;

const TEXT_SYSTEM = `You extract the foods a client just logged from a short message.

Rules:
- Output one entry per distinct food. Split combined phrases: "2 rotis and dal" → two items.
- name = the food only, singular where natural, no numbers ("roti", not "2 rotis").
- qty = the amount the client gave; if they gave none, use 1.
- unit = the exact unit/count word they used ("rotis", "katori", "cup", "bowl", "plate", "g", "ml"); null if none.
- Never invent foods that weren't mentioned. Never output calories or macros.
- If the message contains no food, return an empty items list.`;

// Text path: "2 rotis, dal, salad" → structured items. modelRouter('parse') → Haiku.
export async function parseMealText(rawInput: string): Promise<ParsedMeal> {
  const text = rawInput.trim();
  if (!text) return { items: [] };
  return zodOutput(ParsedMealSchema, {
    task: "parse",
    system: TEXT_SYSTEM,
    cacheSystem: true,
    prompt: `Client's message:\n${text}`,
    maxTokens: 1000,
  });
}

const PHOTO_SYSTEM = `You identify the foods visible in a photo of a meal so the client can confirm them.

Rules:
- List only foods you can actually see; do not guess hidden ingredients.
- name = the food (e.g. "roti", "dal", "rice", "grilled chicken").
- qty + unit = your best portion estimate ("2 rotis", "1 katori dal", "1 bowl rice"); if unsure, qty 1 and a sensible unit or null.
- Never output calories or macros — the app computes those after the client confirms.`;

// Photo path: a meal image → the SAME {name, qty, unit} items. Structured output
// with an image block (modelRouter('ingest') — the vision-capable tier). Not run
// through callWithResilience (mirrors visionExtractText); a best-effort caller
// handles failure by falling back to manual entry.
export async function proposeMealFromPhoto(
  base64Data: string,
  mediaType: VisionMediaType,
): Promise<ParsedMeal> {
  const client = getClaudeClient();
  const model = modelRouter("ingest");
  const response = await withAiTask("ingest", () =>
    client.messages.parse({
      model,
      max_tokens: 1200,
      system: [
        { type: "text" as const, text: PHOTO_SYSTEM, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
            { type: "text", text: "Identify the foods in this meal photo with portion estimates." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ParsedMealSchema) },
    }),
  );
  return response.parsed_output ?? { items: [] };
}
