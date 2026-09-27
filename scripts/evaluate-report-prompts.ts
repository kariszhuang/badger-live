import { buildPromptEvaluations, scorePromptEvaluation } from "../src/lib/report/prompt-evaluations";
import { IntakeServiceError, interpretReport } from "../src/lib/report/intake-model";

function parseRepeats(args: string[]) {
  const cleanArgs = args.filter((arg) => arg !== "--");
  const optionIndex = cleanArgs.indexOf("--repeats");
  if (optionIndex === -1) return 1;
  const value = Number(cleanArgs[optionIndex + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("--repeats must be a whole number from 1 to 5.");
  }
  return value;
}

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_REPORT_MODEL) {
    console.error("No OpenAI requests were sent. Set OPENAI_API_KEY and OPENAI_REPORT_MODEL to run live prompt evaluations.");
    process.exitCode = 2;
    return;
  }

  let repeats: number;
  try { repeats = parseRepeats(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid evaluation options.");
    process.exitCode = 2;
    return;
  }

  const cases = buildPromptEvaluations();
  let passed = 0;
  let failed = 0;
  console.log(`Evaluating ${cases.length} cases against ${process.env.OPENAI_REPORT_MODEL} (${repeats} ${repeats === 1 ? "run" : "runs"} each).`);

  for (let run = 1; run <= repeats; run += 1) {
    for (const testCase of cases) {
      try {
        const plan = await interpretReport({ mode: testCase.mode, text: testCase.text, places: testCase.places, context: testCase.context });
        const failures = scorePromptEvaluation(testCase, plan);
        if (failures.length) {
          failed += 1;
          console.error(`FAIL run ${run} · ${testCase.id} · ${failures.join("; ")}`);
        } else {
          passed += 1;
          console.log(`PASS run ${run} · ${testCase.id} · ${plan.intent} · ${plan.issues.map((issue) => issue.kind).join(",") || "no issues"}`);
        }
      } catch (error) {
        failed += 1;
        const reason = error instanceof IntakeServiceError
          ? [error.code, error.diagnostic].filter(Boolean).join(":")
          : "request failed";
        console.error(`FAIL run ${run} · ${testCase.id} · ${reason}`);
      }
    }
  }
  console.log(`Prompt evaluation: ${passed} passed, ${failed} failed out of ${passed + failed} runs.`);
  if (failed) process.exitCode = 1;
}

await main();
