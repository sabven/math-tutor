import { anthropic, GENERATION_MODEL } from "./anthropic";
import { fillTemplate, loadPromptTemplate } from "./prompts";
import type { Answer } from "./mathVerify";
import { prisma } from "./prisma";
import { gateContent, recordGenerationAudit } from "./contentGate";
import type { Prisma } from "@prisma/client";

export type LessonDiagram =
  | {
      type: "bar";
      bars: { numerator: number; denominator: number; label?: string }[];
    }
  | {
      type: "grid";
      rows: number;
      cols: number;
      rowsShaded: number;
      colsShaded: number;
      aLabel?: string;
      bLabel?: string;
    };

export interface SubtopicLesson {
  summary: string;
  example_text?: string;
  diagram?: LessonDiagram;
}

export interface ChapterConfig {
  chapter_id: string;
  version: number;
  subtopics: { id: string; name: string; lesson?: SubtopicLesson; fallback_hint?: string }[];
  difficulty_ladder: {
    level: number;
    label?: string;
    active_subtopics: string[];
  }[];
  misconceptions: {
    id: string;
    subtopics: string[];
    name: string;
    description: string;
    distractor_rule: string;
  }[];
  session_defaults: {
    problems_per_session: number;
  };
  generation_rules: {
    options_per_problem: number;
    position_policy: string;
  };
  speed_targets_seconds: Record<string, number>;
}

// Mirrors mastery_rules.mastered_threshold in the chapter config ("elo >= 1200
// for the subtopic at grade-calibrated difficulty"), which is prose, not a
// machine-parseable value.
export const MASTERED_ELO_THRESHOLD = 1200;

export interface RawOption {
  display: string;
  is_correct: boolean;
  misconception_id: string | null;
}

export interface RawProblem {
  temp_id: string;
  subtopic_id: string;
  level: number;
  statement: string;
  statement_latex: string;
  answer: Answer;
  verify_expression?: string;
  verify_substitution?: { equation: string; solution: string };
  options: RawOption[];
  hint: string;
  solution_steps: string[];
  estimated_seconds: number;
  context_tag?: string;
}

export interface BatchSpecEntry {
  subtopic_id: string;
  level: number;
  count: number;
  stretch?: boolean;
  review?: boolean;
}

export interface StudentState {
  current_level: number;
  subtopic_elo: Record<string, number>;
  recent_misconceptions: { id: string; count: number }[];
  median_time_seconds: number | null;
  recent_problem_statements: string[];
}

function distributeCounts(subtopicIds: string[], total: number): number[] {
  if (subtopicIds.length === 0 || total <= 0) return subtopicIds.map(() => 0);
  const base = Math.floor(total / subtopicIds.length);
  let remainder = total - base * subtopicIds.length;
  return subtopicIds.map(() => base + (remainder-- > 0 ? 1 : 0));
}

function distribute(
  entries: BatchSpecEntry[],
  subtopicIds: string[],
  level: number,
  total: number,
  flags: Partial<Pick<BatchSpecEntry, "stretch" | "review">>
) {
  if (subtopicIds.length === 0 || total <= 0) return;
  const counts = distributeCounts(subtopicIds, total);
  subtopicIds.forEach((subtopic_id, i) => {
    if (counts[i] > 0) entries.push({ subtopic_id, level, count: counts[i], ...flags });
  });
}

function mergeBatchSpecEntries(entries: BatchSpecEntry[]): BatchSpecEntry[] {
  const map = new Map<string, BatchSpecEntry>();
  for (const e of entries) {
    const key = `${e.subtopic_id}|${e.level}|${e.stretch ?? false}|${e.review ?? false}`;
    const existing = map.get(key);
    if (existing) existing.count += e.count;
    else map.set(key, { ...e });
  }
  return Array.from(map.values());
}

/**
 * Builds the 60% weakest / 20% review-mastered / 20% stretch batch mix from
 * session_defaults.mix, using real per-subtopic Elo to target the weakest
 * subtopics first, review subtopics already mastered at earlier levels, and
 * stretch into the next level up.
 */
export async function buildAdaptiveBatchSpec(
  config: ChapterConfig,
  studentId: string,
  currentLevel: number,
  totalCount: number,
  allowedSubtopicIds?: string[] | null
): Promise<BatchSpecEntry[]> {
  const rung = config.difficulty_ladder.find((l) => l.level === currentLevel);
  if (!rung) throw new Error(`No difficulty ladder entry for level ${currentLevel}`);

  // A parent-set active-subtopics filter (null/empty = no restriction).
  const restrict = (ids: string[]) =>
    allowedSubtopicIds && allowedSubtopicIds.length > 0
      ? ids.filter((id) => allowedSubtopicIds.includes(id))
      : ids;

  const skillScores = await prisma.skillScore.findMany({ where: { studentId } });
  const eloBySubtopic = new Map(skillScores.map((s) => [s.subtopicId, s.elo]));
  const eloFor = (id: string) => eloBySubtopic.get(id) ?? 1000;

  const weakestCount = Math.round(totalCount * 0.6);
  const reviewCount = Math.round(totalCount * 0.2);
  const stretchCount = totalCount - weakestCount - reviewCount;

  const entries: BatchSpecEntry[] = [];

  const currentSubtopics = restrict([...rung.active_subtopics]).sort(
    (a, b) => eloFor(a) - eloFor(b)
  );
  distribute(entries, currentSubtopics, currentLevel, weakestCount, {});

  const masteredEarlier: { subtopic_id: string; level: number }[] = [];
  for (const earlierRung of config.difficulty_ladder.filter((l) => l.level < currentLevel)) {
    for (const id of restrict(earlierRung.active_subtopics)) {
      if (eloFor(id) >= MASTERED_ELO_THRESHOLD && !masteredEarlier.some((m) => m.subtopic_id === id)) {
        masteredEarlier.push({ subtopic_id: id, level: earlierRung.level });
      }
    }
  }
  if (masteredEarlier.length > 0) {
    for (const { subtopic_id, level } of masteredEarlier) {
      distribute(entries, [subtopic_id], level, Math.ceil(reviewCount / masteredEarlier.length), {
        review: true,
      });
    }
  } else {
    // Nothing mastered yet to review — fold this slice back into current-level practice.
    distribute(entries, currentSubtopics, currentLevel, reviewCount, {});
  }

  const nextRung = config.difficulty_ladder.find((l) => l.level === currentLevel + 1);
  if (nextRung) {
    distribute(entries, restrict(nextRung.active_subtopics), nextRung.level, stretchCount, {
      stretch: true,
    });
  } else {
    distribute(entries, currentSubtopics, currentLevel, stretchCount, {});
  }

  const merged = mergeBatchSpecEntries(entries);
  // Rounding across three buckets can drift the total by a problem or two —
  // true it up on the largest (weakest-practice, unflagged) entry.
  const drift = totalCount - merged.reduce((sum, e) => sum + e.count, 0);
  if (drift !== 0) {
    const target =
      merged.find((e) => !e.stretch && !e.review) ?? merged[merged.length - 1];
    if (target) target.count = Math.max(1, target.count + drift);
  }

  return merged;
}

export async function buildStudentState(
  studentId: string,
  config: ChapterConfig,
  level: number
): Promise<StudentState> {
  const skillScores = await prisma.skillScore.findMany({ where: { studentId } });
  const eloBySubtopic = new Map(skillScores.map((s) => [s.subtopicId, s.elo]));
  const subtopic_elo: Record<string, number> = {};
  for (const subtopic of config.subtopics) {
    subtopic_elo[subtopic.id] = eloBySubtopic.get(subtopic.id) ?? 1000;
  }

  const recentAttempts = await prisma.attempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    where: { session: { studentId } },
    include: { problem: true },
  });

  const misconceptionCounts = new Map<string, number>();
  for (const attempt of recentAttempts) {
    if (attempt.misconceptionId) {
      misconceptionCounts.set(
        attempt.misconceptionId,
        (misconceptionCounts.get(attempt.misconceptionId) ?? 0) + 1
      );
    }
  }

  const seconds = recentAttempts.map((a) => a.seconds).sort((a, b) => a - b);
  const median_time_seconds =
    seconds.length > 0 ? seconds[Math.floor(seconds.length / 2)] : null;

  return {
    current_level: level,
    subtopic_elo,
    recent_misconceptions: Array.from(misconceptionCounts.entries()).map(
      ([id, count]) => ({ id, count })
    ),
    median_time_seconds,
    recent_problem_statements: recentAttempts.map((a) => a.problem.statement),
  };
}

function parseModelJsonArray(text: string): RawProblem[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON array");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface GenerationResult {
  saved: number;
  requested: number;
  failures: { temp_id: string; reason: string }[];
  gateStats: { pass: number; fail: number };
}

export async function generateAndSaveBatch(
  chapterId: string,
  batchSize: number,
  batchSpec: BatchSpecEntry[],
  studentState: StudentState
): Promise<GenerationResult> {
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const config = chapter.config as unknown as ChapterConfig;

  const template = loadPromptTemplate("generate-batch.md");
  const maxAttempts = 3;

  const failures: { temp_id: string; reason: string }[] = [];
  const verified: RawProblem[] = [];
  const gateStats = { pass: 0, fail: 0 };
  let previousFailureReasons = "";

  // docs/content-gate.md §5's reject/regenerate loop, applied here too (not
  // just the live hint/retry surface in lib/hintRetry.ts): a single one-shot
  // request silently under-fills the batch whenever the gate's pass rate
  // dips for a subtopic, which on the session bank-fill path (lib/session.ts)
  // means the child gets served fewer problems than the parent's configured
  // session length with no signal that anything went wrong.
  for (let attempt = 1; attempt <= maxAttempts && verified.length < batchSize; attempt++) {
    const remaining = batchSize - verified.length;
    const requestSize = Math.ceil(remaining * 1.3);

    const user = fillTemplate(template.user, {
      batch_size: String(requestSize),
      batch_spec_json: JSON.stringify(batchSpec),
      chapter_config_json: JSON.stringify(config),
      student_state_json: JSON.stringify(studentState),
      previous_failure_reasons: previousFailureReasons,
    });

    const response = await anthropic.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 8000,
      temperature: 0.7,
      system: template.system,
      messages: [{ role: "user", content: user }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text content in generation response");
    }

    const rawProblems = parseModelJsonArray(textBlock.text);
    const attemptFailureReasons: string[] = [];

    for (const problem of rawProblems) {
      const verdict = await gateContent({ kind: "problem", problem }, config);
      await recordGenerationAudit({
        kind: "problem",
        pass: verdict.pass,
        reasons: verdict.reasons,
        attempt,
        model: GENERATION_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        content: JSON.stringify(problem),
      });

      if (!verdict.pass) {
        gateStats.fail++;
        failures.push({ temp_id: problem.temp_id, reason: verdict.reasons.join("; ") });
        attemptFailureReasons.push(verdict.reasons.join("; "));
        continue;
      }
      gateStats.pass++;
      verified.push(problem);
      if (verified.length >= batchSize) break;
    }

    if (verified.length < batchSize && attemptFailureReasons.length > 0) {
      previousFailureReasons = `Previous attempt rejected ${attemptFailureReasons.length} problem(s) because: ${attemptFailureReasons.join("; ")}. Fix these issues and use different numbers.`;
    }
  }

  for (const problem of verified) {
    await saveVerifiedProblem(chapterId, problem);
  }

  return { saved: verified.length, requested: batchSize, failures, gateStats };
}

export async function saveVerifiedProblem(chapterId: string, problem: RawProblem) {
  const shuffledOptions = shuffle(problem.options);
  return prisma.problem.create({
    data: {
      chapterId,
      subtopicId: problem.subtopic_id,
      level: problem.level,
      statement: problem.statement,
      statementLatex: problem.statement_latex,
      answer: problem.answer as unknown as Prisma.InputJsonValue,
      options: shuffledOptions as unknown as Prisma.InputJsonValue,
      hint: problem.hint,
      solutionSteps: problem.solution_steps as unknown as Prisma.InputJsonValue,
      estimatedSeconds: problem.estimated_seconds,
      verified: true,
    },
  });
}
