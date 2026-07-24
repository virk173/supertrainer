import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyRoute, ROUTE_FIXTURES, routeMessage } from "../../src/comms-router";
import { flushTracing } from "../../src/tracing";

// Phase 6.3 comms-router eval — runs the LIVE Haiku classifier over the 50-case
// fixture suite (the CI merge gate uses a deterministic fake; this measures the
// real model). Gate: 100% escalation recall (zero false negatives) + ≥90% overall
// routing accuracy. Not run in CI (needs ANTHROPIC_API_KEY); run manually with
// `npm run eval:comms` from packages/ai.

function loadEnv(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.resolve(scriptDir, "../../../..", "apps/web/.env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function main(): Promise<void> {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("eval:comms needs ANTHROPIC_API_KEY (apps/web/.env.local or env).");
    process.exit(1);
  }

  let correct = 0;
  const falseNegatives: string[] = [];
  for (const f of ROUTE_FIXTURES) {
    // Real model, real router.
    const r = await routeMessage(f.text, { classify: classifyRoute });
    if (r.category === f.expect) correct++;
    if (f.expect === "escalation" && !r.escalation) {
      falseNegatives.push(`  MISS: "${f.text}" → ${r.category}`);
    }
    const mark = r.category === f.expect ? "✓" : f.expect === "escalation" && !r.escalation ? "✗ FN" : "·";
    console.log(`${mark} [${f.id}] expect=${f.expect} got=${r.category} (src=${r.source})`);
  }

  await flushTracing();

  const accuracy = correct / ROUTE_FIXTURES.length;
  const recallOk = falseNegatives.length === 0;
  console.log(`\nrouting accuracy: ${(accuracy * 100).toFixed(1)}%  (gate ≥90%)`);
  console.log(`escalation recall: ${recallOk ? "100%" : `${falseNegatives.length} false negative(s)`}  (gate 100%)`);
  if (falseNegatives.length) console.log(falseNegatives.join("\n"));

  if (!recallOk || accuracy < 0.9) {
    console.error("\nFAIL: eval gate not met.");
    process.exit(1);
  }
  console.log("\nPASS");
}

void main();
