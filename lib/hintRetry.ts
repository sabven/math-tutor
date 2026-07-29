import type { Problem } from "@prisma/client";
import { anthropic, GENERATION_MODEL } from "./anthropic";
import { fillTemplate, loadPromptTemplate } from "./prompts";
import { prisma } from "./prisma";
import { ChapterConfig, RawProblem, saveVerifiedProblem, verifyProblem } from "./generation";

export interface StoredOption {
  display: string;
  is_correct: boolean;
  misconception_id: string | null;
}

export interface HintRetryResult {
  hint: string;
  encouragement: string;
  retryProblem: Problem | null;
}

interface HintRetryModelResponse {
  hint: string;
  encouragement: string;
  retry_problem: RawProblem;
}

function parseModelJsonObject(text: string): HintRetryModelResponse {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function fetchBankFallback(
  chapterId: string,
  subtopicId: string,
  level: number,
  excludeProblemId: string
): Promise<Problem | null> {
  const found = await prisma.problem.findFirst({
    where: {
      chapterId,
      subtopicId,
      level,
      verified: true,
      usedAt: null,
      id: { not: excludeProblemId },
    },
    orderBy: { createdAt: "asc" },
  });
  return found;
}

/**
 * On a wrong answer: gets a live, misconception-targeted Socratic hint plus a
 * freshly generated retry problem (same subtopic/level, new numbers, same
 * misconception opportunity). Falls back to the problem's static hint and an
 * unused bank problem of the same subtopic/level if generation or
 * verification fails.
 */
export async function generateHintAndRetry(
  problem: Problem,
  chosenOption: StoredOption,
  config: ChapterConfig,
  seconds: number
): Promise<HintRetryResult> {
  const misconception = config.misconceptions.find(
    (m) => m.id === chosenOption.misconception_id
  );

  if (!misconception) {
    return {
      hint: problem.hint,
      encouragement: "Keep going, you've got this!",
      retryProblem: await fetchBankFallback(
        problem.chapterId,
        problem.subtopicId,
        problem.level,
        problem.id
      ),
    };
  }

  const template = loadPromptTemplate("hint-retry.md");
  const user = fillTemplate(template.user, {
    problem_json: JSON.stringify({
      subtopic_id: problem.subtopicId,
      level: problem.level,
      statement: problem.statement,
      statement_latex: problem.statementLatex,
      answer: problem.answer,
      options: problem.options,
      hint: problem.hint,
      solution_steps: problem.solutionSteps,
      estimated_seconds: problem.estimatedSeconds,
    }),
    chosen_option_json: JSON.stringify(chosenOption),
    misconception_json: JSON.stringify(misconception),
    seconds: String(seconds),
    chapter_config_json: JSON.stringify(config),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: GENERATION_MODEL,
        max_tokens: 2000,
        temperature: 0.3,
        system: template.system,
        messages: [{ role: "user", content: user }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") continue;

      const parsed = parseModelJsonObject(textBlock.text);
      const failureReason = verifyProblem(parsed.retry_problem, config);
      if (failureReason) continue;

      const saved = await saveVerifiedProblem(problem.chapterId, parsed.retry_problem);
      return { hint: parsed.hint, encouragement: parsed.encouragement, retryProblem: saved };
    } catch {
      // try again; falls through to the bank fallback below after the loop
    }
  }

  return {
    hint: problem.hint,
    encouragement: "Keep going, you've got this!",
    retryProblem: await fetchBankFallback(
      problem.chapterId,
      problem.subtopicId,
      problem.level,
      problem.id
    ),
  };
}
