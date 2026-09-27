import { describe, expect, it } from "vitest";
import type { IntakePlan } from "./types";
import { buildPromptEvaluations, scorePromptEvaluation } from "./prompt-evaluations";

const basePlan: IntakePlan = {
  intent: "report",
  issues: [{ kind: "ice", evidence: "Very icy here", placeName: null, observedAt: null, observedAtBasis: "submission", locationIntent: "here", relativeToIssueIndex: null }],
  missingCriticalField: "none",
  followup: null,
  acknowledgment: "Thanks for reporting it.",
};

describe("report prompt evaluation fixtures", () => {
  it("covers multi-issue, location, follow-up, untrusted-input, emergency, and read-only scenarios", () => {
    expect(buildPromptEvaluations().map((testCase) => testCase.id)).toEqual([
      "single-current-condition",
      "three-conditions-and-relative-place",
      "trusted-named-place-and-past-tense",
      "unresolved-relative-location",
      "missing-actionable-condition",
      "vague-past-observation-time",
      "ask-mode-stays-read-only",
      "ignore-injected-instructions",
      "immediate-emergency-is-out-of-scope",
      "question-is-not-a-report",
    ]);
  });

  it("scores the production model output against explicit expectations", () => {
    const testCase = buildPromptEvaluations()[0];
    expect(scorePromptEvaluation(testCase, basePlan)).toEqual([]);
    expect(scorePromptEvaluation(testCase, { ...basePlan, issues: [] })).toContain("issue count expected 1, got 0");
  });

  it("detects accidental repetition of untrusted person-like content", () => {
    const injectionCase = buildPromptEvaluations().find((testCase) => testCase.id === "ignore-injected-instructions")!;
    const unsafePlan: IntakePlan = { ...basePlan, acknowledgment: "CampusPerson42 was named." };
    expect(scorePromptEvaluation(injectionCase, unsafePlan)).toContain("output repeated forbidden marker CampusPerson42");
  });
});
