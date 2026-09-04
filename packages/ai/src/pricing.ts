// Phase 9.3 — what a Claude call actually costs us, in integer money.
//
// Langfuse computes cost for the trace store; this table exists because cost has
// to gate BEHAVIOUR (an org crossing its budget gets throttled to batch-only),
// and a decision that changes what the product does cannot depend on an external
// service being reachable. Arithmetic stays in code — a model never prices
// itself (CLAUDE.md rule 4).
//
// Units are micros: millionths of a dollar, held in integers, so no float ever
// touches the ledger. $3 per million input tokens = 3 micros per 1k tokens.

/** USD per MILLION tokens, matching the published per-model list prices. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Prefix match, longest first — ids carry date suffixes (…-20251001). */
const PRICES: [prefix: string, price: ModelPrice][] = [
  ["claude-haiku-4-5", { inputPerMTok: 1, outputPerMTok: 5 }],
  ["claude-sonnet-5", { inputPerMTok: 3, outputPerMTok: 15 }],
  ["claude-opus-4-8", { inputPerMTok: 5, outputPerMTok: 25 }],
  ["claude-opus-5", { inputPerMTok: 5, outputPerMTok: 25 }],
  // Older families still reachable through the fallback ladder.
  ["claude-3-5-haiku", { inputPerMTok: 0.8, outputPerMTok: 4 }],
  ["claude-3-7-sonnet", { inputPerMTok: 3, outputPerMTok: 15 }],
];

/** The price we assume for a model we don't recognise: the most expensive one we
 *  know. Guessing low would silently understate spend, which is the failure that
 *  actually costs money. */
const UNKNOWN_MODEL_PRICE: ModelPrice = { inputPerMTok: 5, outputPerMTok: 25 };

export function priceFor(model: string): ModelPrice {
  let best: ModelPrice | null = null;
  let bestLen = -1;
  for (const [prefix, price] of PRICES) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = price;
      bestLen = prefix.length;
    }
  }
  return best ?? UNKNOWN_MODEL_PRICE;
}

/** Cost of one call in micros (millionths of a dollar), rounded half-up. */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  const inputMicros = (Math.max(0, inputTokens) * price.inputPerMTok) / 1_000_000;
  const outputMicros = (Math.max(0, outputTokens) * price.outputPerMTok) / 1_000_000;
  // per-MTok price × tokens gives dollars; ×1e6 gives micros.
  return Math.round((inputMicros + outputMicros) * 1_000_000);
}

/** Micros → a display string. Sub-cent spend still reads as a number, never 0. */
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (Math.abs(dollars) < 0.01) return `$${dollars.toFixed(4)}`;
  if (Math.abs(dollars) < 1000) return `$${dollars.toFixed(2)}`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}
