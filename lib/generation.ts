import { anthropic, GENERATION_MODEL } from "./anthropic";
import { fillTemplate, loadPromptTemplate } from "./prompts";
import {
  Answer,
  answerToNumber,
  isSimplified,
  verifyExpressionMatchesAnswer,
  verifySubstitutionMatches,
} from "./mathVerify";
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export interface ChapterConfig {
  chapter_id: string;
  version: number;
  subtopics: { id: string; name: string }[];
  difficulty_ladder: {
    level: number;
    active_subtopics: string[];
  }[];
  misconceptions: { id: string }[];
  session_defaults: {
    problems_per_session: number;
  };
  generation_rules: {
    options_per_problem: number;
    position_policy: string;
  };
}

interface RawOption {
  display: string;
  is_correct: boolean;
  misconception_id: string | null;
}

interface RawProblem {
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

export function buildBatchSpecForLevel(
  config: ChapterConfig,
  level: number,
  totalCount: number
): BatchSpecEntry[] {
  const rung = config.difficulty_ladder.find((l) => l.level === level);
  if (!rung) throw new Error(`No difficulty ladder entry for level ${level}`);
  const subtopics = rung.active_subtopics;
  const base = Math.floor(totalCount / subtopics.length);
  let remainder = totalCount - base * subtopics.length;
  return subtopics.map((subtopic_id) => {
    const count = base + (remainder-- > 0 ? 1 : 0);
    return { subtopic_id, level, count };
  });
}

export async function buildStudentState(
  studentId: string,
  config: ChapterConfig,
  level: number
): Promise<StudentState> {
  const subtopic_elo: Record<string, number> = {};
  const rung = config.difficulty_ladder.find((l) => l.level === level);
  for (const id of rung?.active_subtopics ?? []) {
    subtopic_elo[id] = 1000;
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

function verifyProblem(problem: RawProblem, config: ChapterConfig): string | null {
  if (!problem.options || problem.options.length !== config.generation_rules.options_per_problem) {
    return "wrong option count";
  }
  const correctOptions = problem.options.filter((o) => o.is_correct);
  if (correctOptions.length !== 1) return "must have exactly 1 correct option";

  const values = problem.options.map((o) => o.display);
  if (new Set(values).size !== values.length) return "duplicate option values";

  const validMisconceptionIds = new Set(config.misconceptions.map((m) => m.id));
  for (const opt of problem.options) {
    if (!opt.is_correct) {
      if (!opt.misconception_id || !validMisconceptionIds.has(opt.misconception_id)) {
        return `invalid misconception_id: ${opt.misconception_id}`;
      }
    }
  }

  if (!isSimplified(problem.answer)) return "answer not simplified";

  if (problem.verify_substitution) {
    if (!verifySubstitutionMatches(problem.verify_substitution)) {
      return "substitution check failed";
    }
  } else if (problem.verify_expression) {
    if (!verifyExpressionMatchesAnswer(problem.verify_expression, problem.answer)) {
      return "expression verification failed";
    }
  } else {
    if (answerToNumber(problem.answer) === null) {
      return "no verify_expression/verify_substitution and answer not directly checkable";
    }
  }

  return null;
}

function shuffle<T>(arr: T[]): T[] {
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
  const requestSize = Math.ceil(batchSize * 1.3);

  const system = template.system;
  const user = fillTemplate(template.user, {
    batch_size: String(requestSize),
    batch_spec_json: JSON.stringify(batchSpec),
    chapter_config_json: JSON.stringify(config),
    student_state_json: JSON.stringify(studentState),
  });

  const response = await anthropic.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 8000,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in generation response");
  }

  const rawProblems = parseModelJsonArray(textBlock.text);

  const failures: { temp_id: string; reason: string }[] = [];
  const verified: RawProblem[] = [];

  for (const problem of rawProblems) {
    const failureReason = verifyProblem(problem, config);
    if (failureReason) {
      failures.push({ temp_id: problem.temp_id, reason: failureReason });
      continue;
    }
    verified.push(problem);
    if (verified.length >= batchSize) break;
  }

  for (const problem of verified) {
    const shuffledOptions = shuffle(problem.options);
    await prisma.problem.create({
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

  return { saved: verified.length, requested: batchSize, failures };
}
