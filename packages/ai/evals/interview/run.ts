import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectHealthFlags } from "../../src/escalation";
import {
  INTERVIEW_SECTIONS,
  interviewTurn,
  isInterviewComplete,
  isSectionComplete,
  type InterviewSection,
  type SectionAnswers,
} from "../../src/interview";
import { flushTracing } from "../../src/tracing";
import { PERSONAS, type Persona } from "./personas";

// Stage B interview eval (Phase 2.5 DoD): every persona must produce a complete
// valid intake OR trip the correct health flag. The joker case checks the
// opposite failure mode — inventing answers nobody gave.

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

interface Result {
  persona: string;
  pass: boolean;
  detail: string;
}

// Health screening runs on every client message, exactly as the engine does it.
async function runHealthPersona(p: Persona): Promise<Result> {
  const text = Object.values(p.answers)[0] ?? "";
  const flags = await detectHealthFlags(text);
  if (!flags.flagged) {
    return { persona: p.id, pass: false, detail: "NOT flagged — a health disclosure was missed" };
  }
  const missing = (p.expectCategories ?? []).filter((c) => !flags.categories.includes(c as never));
  if (missing.length) {
    return {
      persona: p.id,
      pass: false,
      detail: `flagged but missed categories: ${missing.join(", ")} (got ${flags.categories.join(", ")})`,
    };
  }
  return {
    persona: p.id,
    pass: true,
    detail: `flagged [${flags.categories.join(", ")}] via ${flags.source}`,
  };
}

// The joker must yield NOTHING — an invented timezone here would silently
// corrupt the plan downstream.
async function runJokerPersona(p: Persona): Promise<Result> {
  const turn = await interviewTurn({
    section: "logistics",
    styleText: "",
    history: [],
    answersSoFar: {},
    clientMessage: p.answers.logistics ?? "",
    clientName: "Sam",
  });
  const invented = Object.keys(turn.parsed);
  if (invented.length > 0) {
    return {
      persona: p.id,
      pass: false,
      detail: `FABRICATED ${invented.join(", ")} = ${JSON.stringify(turn.parsed)}`,
    };
  }
  return { persona: p.id, pass: true, detail: "captured nothing (correct) and re-asked" };
}

// Walks every section, feeding the persona's scripted answers, and checks that
// the merged intake actually validates.
async function runCompletePersona(p: Persona): Promise<Result> {
  const answers: Record<string, SectionAnswers> = {};

  for (const section of INTERVIEW_SECTIONS) {
    const replies = [p.answers[section], p.followUps?.[section]].filter(Boolean) as string[];
    if (replies.length === 0) {
      return { persona: p.id, pass: false, detail: `no scripted answer for ${section}` };
    }

    let sectionAnswers: SectionAnswers = {};
    for (const reply of replies) {
      // A health disclosure would legitimately pause a real interview; these
      // personas must not trip it.
      const flags = await detectHealthFlags(reply);
      if (flags.flagged) {
        return {
          persona: p.id,
          pass: false,
          detail: `false health flag on ${section}: ${flags.matched.join(", ")}`,
        };
      }

      const turn = await interviewTurn({
        section: section as InterviewSection,
        styleText: "",
        history: [],
        answersSoFar: sectionAnswers,
        clientMessage: reply,
        clientName: "Sam",
      });
      sectionAnswers = { ...sectionAnswers, ...turn.parsed };
      if (isSectionComplete(section, sectionAnswers)) break;
    }

    if (!isSectionComplete(section, sectionAnswers)) {
      return {
        persona: p.id,
        pass: false,
        detail: `${section} incomplete — got ${JSON.stringify(sectionAnswers)}`,
      };
    }
    answers[section] = sectionAnswers;
  }

  if (!isInterviewComplete(answers)) {
    return { persona: p.id, pass: false, detail: "sections passed but intake invalid" };
  }
  const logistics = answers.logistics as { timezone?: string; preferredLanguage?: string };
  const nutrition = answers.nutrition as { mealsPerDay?: number; mealTimes?: string[] };
  return {
    persona: p.id,
    pass: true,
    detail: `tz=${logistics.timezone} lang=${logistics.preferredLanguage} meals=${nutrition.mealsPerDay} times=${(nutrition.mealTimes ?? []).join("/")}`,
  };
}

async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — cannot run the interview eval.");
    process.exit(2);
  }

  console.log(`Running Stage B interview eval on ${PERSONAS.length} personas…\n`);

  const results: Result[] = [];
  for (const persona of PERSONAS) {
    process.stdout.write(`  ${persona.id.padEnd(18)} `);
    let result: Result;
    try {
      result =
        persona.expect === "health_flag"
          ? await runHealthPersona(persona)
          : persona.expect === "no_fabrication"
            ? await runJokerPersona(persona)
            : await runCompletePersona(persona);
    } catch (err) {
      result = {
        persona: persona.id,
        pass: false,
        detail: err instanceof Error ? err.message : "threw",
      };
    }
    results.push(result);
    console.log(`${result.pass ? "PASS" : "FAIL"}  ${result.detail}`);
  }

  await flushTracing();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} personas passed.`);
  if (failed.length) {
    console.error(`\nFailed: ${failed.map((f) => f.persona).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
