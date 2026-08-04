import katex from "katex";
import { createHash } from "crypto";
import { answerToNumber, isSimplified, verifyExpressionMatchesAnswer, verifySubstitutionMatches } from "./mathVerify";
import type { Answer } from "./mathVerify";
import type { ChapterConfig, RawProblem } from "./generation";
import { moderateContent } from "./moderation";
import { prisma } from "./prisma";

export type GatePayload =
  | { kind: "problem" | "retry_problem"; problem: RawProblem }
  | { kind: "hint"; hintText: string; answer: Answer };

export interface GateVerdict {
  pass: boolean;
  reasons: string[];
}

/**
 * Best-effort parse of an option's display string into a comparable number,
 * so "2/4" and "1/2" are caught as the same value even though options only
 * store a display string today (no structured per-option value). Returns
 * null for anything that doesn't match a known format (e.g. "None of
 * these"), in which case the caller falls back to exact string comparison.
 */
export function parseDisplayValue(display: string): number | null {
  const trimmed = display.trim();

  const mixed = trimmed.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed;
    const w = Number(whole);
    const sign = w < 0 ? -1 : 1;
    return w + sign * (Number(num) / Number(den));
  }

  const fraction = trimmed.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) {
    const [, num, den] = fraction;
    return Number(num) / Number(den);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return null;
}

function checkProblemCorrectness(problem: RawProblem, config: ChapterConfig): string[] {
  const reasons: string[] = [];

  if (!problem.options || problem.options.length !== config.generation_rules.options_per_problem) {
    reasons.push("wrong option count");
  }

  const correctOptions = (problem.options ?? []).filter((o) => o.is_correct);
  if (correctOptions.length !== 1) reasons.push("must have exactly 1 correct option");

  const normalizedKeys = (problem.options ?? []).map((o) => {
    const parsed = parseDisplayValue(o.display);
    return parsed !== null ? `n:${parsed}` : `s:${o.display}`;
  });
  if (new Set(normalizedKeys).size !== normalizedKeys.length) {
    reasons.push("duplicate option values");
  }

  const validMisconceptionIds = new Set(config.misconceptions.map((m) => m.id));
  for (const opt of problem.options ?? []) {
    if (!opt.is_correct && (!opt.misconception_id || !validMisconceptionIds.has(opt.misconception_id))) {
      reasons.push(`invalid misconception_id: ${opt.misconception_id}`);
    }
  }

  if (!isSimplified(problem.answer)) reasons.push("answer not simplified");

  if (problem.verify_substitution) {
    if (!verifySubstitutionMatches(problem.verify_substitution)) {
      reasons.push("substitution check failed");
    }
  } else if (problem.verify_expression) {
    if (!verifyExpressionMatchesAnswer(problem.verify_expression, problem.answer)) {
      reasons.push("expression verification failed");
    }
  } else if (answerToNumber(problem.answer) === null) {
    reasons.push("no verify_expression/verify_substitution and answer not directly checkable");
  }

  try {
    katex.renderToString(problem.statement_latex, { throwOnError: true });
  } catch {
    reasons.push("statement_latex fails to render");
  }

  const validSubtopicIds = new Set(config.subtopics.map((s) => s.id));
  if (!validSubtopicIds.has(problem.subtopic_id)) {
    reasons.push(`unknown subtopic_id: ${problem.subtopic_id}`);
  }
  const validLevels = new Set(config.difficulty_ladder.map((l) => l.level));
  if (!validLevels.has(problem.level)) {
    reasons.push(`unknown level: ${problem.level}`);
  }

  const speedTarget = config.speed_targets_seconds[String(problem.level)];
  if (typeof speedTarget === "number") {
    const min = speedTarget * 0.3;
    const max = speedTarget * 3;
    if (problem.estimated_seconds < min || problem.estimated_seconds > max) {
      reasons.push(`estimated_seconds out of sane range: ${problem.estimated_seconds}`);
    }
  }

  return reasons;
}

function checkHintCorrectness(hintText: string, answer: Answer): string[] {
  const value = answerToNumber(answer);
  if (value === null) return [];

  const candidates = new Set<string>();
  if (answer.type === "fraction") {
    candidates.add(`${answer.numerator}/${answer.denominator}`);
  } else if (answer.type === "mixed") {
    candidates.add(`${answer.whole} ${answer.numerator}/${answer.denominator}`);
  } else if (answer.type === "integer") {
    candidates.add(String(answer.value));
  }
  candidates.add(String(value));

  for (const candidate of candidates) {
    if (candidate && hintText.includes(candidate)) {
      return [`hint leaks the answer ("${candidate}")`];
    }
  }
  return [];
}

/** Pure, synchronous, no I/O — deliberately DB-free so it's fast to unit test with fixtures. */
export function checkCorrectness(payload: GatePayload, config: ChapterConfig): string[] {
  if (payload.kind === "hint") {
    return checkHintCorrectness(payload.hintText, payload.answer);
  }
  return checkProblemCorrectness(payload.problem, config);
}

/**
 * The one function every AI-content producer calls. Correctness runs first
 * and short-circuits on failure so a malformed problem never spends a
 * moderation API call.
 */
export async function gateContent(payload: GatePayload, config: ChapterConfig): Promise<GateVerdict> {
  const correctnessReasons = checkCorrectness(payload, config);
  if (correctnessReasons.length > 0) {
    return { pass: false, reasons: correctnessReasons };
  }
  return moderateContent(payload);
}

export async function recordGenerationAudit(entry: {
  kind: string;
  pass: boolean;
  reasons: string[];
  attempt: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  problemId?: string;
  sessionId?: string;
  content: string;
}) {
  const contentHash = createHash("sha256").update(entry.content).digest("hex");
  await prisma.generationAudit.create({
    data: {
      kind: entry.kind,
      pass: entry.pass,
      reasons: entry.reasons,
      attempt: entry.attempt,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      problemId: entry.problemId ?? null,
      sessionId: entry.sessionId ?? null,
      contentHash,
    },
  });
}
