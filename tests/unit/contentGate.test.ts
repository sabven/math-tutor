import { describe, it, expect } from "vitest";
import { checkCorrectness, parseDisplayValue, type GatePayload } from "@/lib/contentGate";
import type { ChapterConfig, RawProblem } from "@/lib/generation";

const config: ChapterConfig = {
  chapter_id: "fractions",
  version: 1,
  subtopics: [{ id: "frac.add", name: "Addition" }],
  difficulty_ladder: [{ level: 1, active_subtopics: ["frac.add"] }],
  misconceptions: [
    { id: "M1", subtopics: ["frac.add"], name: "adds across", description: "x", distractor_rule: "x" },
  ],
  session_defaults: { problems_per_session: 10 },
  generation_rules: { options_per_problem: 4, position_policy: "shuffle" },
  speed_targets_seconds: { "1": 30 },
};

function validProblem(overrides: Partial<RawProblem> = {}): RawProblem {
  return {
    temp_id: "t1",
    subtopic_id: "frac.add",
    level: 1,
    statement: "1/4 + 1/4 = ?",
    statement_latex: "\\frac{1}{4} + \\frac{1}{4} = ?",
    answer: { type: "fraction", numerator: 1, denominator: 2 },
    verify_expression: "1/4 + 1/4",
    options: [
      { display: "1/2", is_correct: true, misconception_id: null },
      { display: "1/4", is_correct: false, misconception_id: "M1" },
      { display: "3/4", is_correct: false, misconception_id: "M1" },
      { display: "1/8", is_correct: false, misconception_id: "M1" },
    ],
    hint: "Add the numerators.",
    solution_steps: ["1/4 + 1/4 = 2/4 = 1/2"],
    estimated_seconds: 30,
    ...overrides,
  };
}

function checkProblem(problem: RawProblem): string[] {
  const payload: GatePayload = { kind: "problem", problem };
  return checkCorrectness(payload, config);
}

describe("parseDisplayValue", () => {
  it("parses simple fractions", () => {
    expect(parseDisplayValue("2/4")).toBe(0.5);
  });
  it("parses mixed numbers", () => {
    expect(parseDisplayValue("1 1/2")).toBe(1.5);
  });
  it("parses integers and decimals", () => {
    expect(parseDisplayValue("3")).toBe(3);
    expect(parseDisplayValue("2.5")).toBe(2.5);
  });
  it("returns null for unparseable text", () => {
    expect(parseDisplayValue("None of these")).toBeNull();
  });
});

describe("checkCorrectness - problem", () => {
  it("passes a well-formed problem", () => {
    expect(checkProblem(validProblem())).toEqual([]);
  });

  it("rejects the wrong option count", () => {
    const p = validProblem({ options: validProblem().options.slice(0, 3) });
    expect(checkProblem(p)).toContain("wrong option count");
  });

  it("rejects zero correct options", () => {
    const p = validProblem();
    p.options = p.options.map((o) => ({ ...o, is_correct: false, misconception_id: "M1" }));
    expect(checkProblem(p)).toContain("must have exactly 1 correct option");
  });

  it("rejects two correct options", () => {
    const p = validProblem();
    p.options[1] = { ...p.options[1], is_correct: true };
    expect(checkProblem(p)).toContain("must have exactly 1 correct option");
  });

  it("catches duplicate option values disguised as different display strings", () => {
    const p = validProblem();
    p.options[1] = { display: "2/4", is_correct: false, misconception_id: "M1" }; // same value as 1/2
    expect(checkProblem(p)).toContain("duplicate option values");
  });

  it("rejects a wrong option with an invalid misconception_id", () => {
    const p = validProblem();
    p.options[1] = { ...p.options[1], misconception_id: "NOT_A_REAL_ID" };
    expect(checkProblem(p).some((r) => r.startsWith("invalid misconception_id"))).toBe(true);
  });

  it("rejects an unsimplified answer", () => {
    const p = validProblem({ answer: { type: "fraction", numerator: 2, denominator: 4 } });
    expect(checkProblem(p)).toContain("answer not simplified");
  });

  it("rejects a verify_expression that doesn't match the answer", () => {
    const p = validProblem({ verify_expression: "1/4 + 1/8" });
    expect(checkProblem(p)).toContain("expression verification failed");
  });

  it("rejects statement_latex that fails to render", () => {
    const p = validProblem({ statement_latex: "\\frac{1}{2" });
    expect(checkProblem(p)).toContain("statement_latex fails to render");
  });

  it("rejects an unknown subtopic_id", () => {
    const p = validProblem({ subtopic_id: "frac.nonexistent" });
    expect(checkProblem(p).some((r) => r.startsWith("unknown subtopic_id"))).toBe(true);
  });

  it("rejects an unknown level", () => {
    const p = validProblem({ level: 99 });
    expect(checkProblem(p).some((r) => r.startsWith("unknown level"))).toBe(true);
  });

  it("rejects estimated_seconds way outside the level's speed target range", () => {
    const p = validProblem({ estimated_seconds: 1000 });
    expect(checkProblem(p).some((r) => r.startsWith("estimated_seconds out of sane range"))).toBe(true);
  });
});

describe("checkCorrectness - hint", () => {
  it("passes a hint that doesn't reveal the answer", () => {
    const payload: GatePayload = {
      kind: "hint",
      hintText: "Think about what happens when denominators match.",
      answer: { type: "fraction", numerator: 1, denominator: 2 },
    };
    expect(checkCorrectness(payload, config)).toEqual([]);
  });

  it("rejects a hint that leaks the answer verbatim", () => {
    const payload: GatePayload = {
      kind: "hint",
      hintText: "The answer is 1/2, try to see why.",
      answer: { type: "fraction", numerator: 1, denominator: 2 },
    };
    expect(checkCorrectness(payload, config).some((r) => r.includes("leaks the answer"))).toBe(true);
  });
});
