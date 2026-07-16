import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractStyleProfile } from "../../src/style/extractors";
import { flushTracing } from "../../src/tracing";
import { FIXTURES } from "./fixtures";
import { scoreFixture } from "./score";

// Style-ingestion eval (Phase 1.3 DoD: >=90% field accuracy on the fixture
// set). Runs each fixture's domain extractor against realistic fake trainer
// materials and scores the result field-by-field. Extraction calls are
// auto-traced to Langfuse via getClaudeClient (no-op without keys).

const PASS_THRESHOLD = 0.9;

// Load ANTHROPIC_API_KEY from apps/web/.env.local unless already in the env
// (so CI can inject it directly).
function loadEnv(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.resolve(scriptDir, "../../../..", "apps/web/.env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function bar(score: number): string {
  const pct = Math.round(score * 100);
  return `${pct}%`.padStart(4);
}

async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — cannot run the style eval.");
    process.exit(2);
  }

  console.log(`Running style-ingestion eval on ${FIXTURES.length} fixtures…\n`);

  const results = await Promise.all(
    FIXTURES.map(async (fx) => {
      try {
        const profile = (await extractStyleProfile(fx.domain, fx.text)) as Record<
          string,
          unknown
        >;
        const score = scoreFixture(fx.expected, profile);
        return { fx, score, profile, error: null as string | null };
      } catch (err) {
        return {
          fx,
          score: { overall: 0, fields: [] },
          profile: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  let sum = 0;
  for (const { fx, score, error } of results) {
    sum += score.overall;
    console.log(`${bar(score.overall)}  ${fx.name} (${fx.domain})`);
    if (error) {
      console.log(`       ERROR: ${error}`);
      continue;
    }
    for (const f of score.fields) {
      if (f.score < 1) {
        console.log(`         ${bar(f.score)}  ${f.field}`);
      }
    }
  }

  const overall = sum / results.length;
  console.log(`\nOverall field accuracy: ${(overall * 100).toFixed(1)}%  (gate: ${PASS_THRESHOLD * 100}%)`);

  await flushTracing();

  if (overall < PASS_THRESHOLD) {
    console.error("\nFAIL — below the 90% gate.");
    process.exit(1);
  }
  console.log("\nPASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
