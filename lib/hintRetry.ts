import type { Problem } from "@prisma/client";
import { anthropic, GENERATION_MODEL } from "./anthropic";
import { fillTemplate, loadPromptTemplate } from "./prompts";
import { prisma } from "./prisma";
import { ChapterConfig, RawProblem, saveVerifiedProblem } from "./generation";
import { gateContent, recordGenerationAudit } from "./contentGate";
import type { Answer } from "./mathVerify";

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

// docs/content-gate.md: when live hint generation is rejected by the gate
// after all retries, fall back to a subtopic-level pre-approved hint rather
// than the original problem's hint (which was written for different numbers
// and a different wrong answer, so it's less relevant to what the student
// just got wrong).
function fallbackHintFor(config: ChapterConfig, subtopicId: string, staticHint: string): string {
  const subtopic = config.subtopics.find((s) => s.id === subtopicId);
  return subtopic?.fallback_hint ?? staticHint;
}

/**
 * On a wrong answer: gets a live, misconception-targeted Socratic hint plus a
 * freshly generated retry problem (same subtopic/level, new numbers, same
 * misconception opportunity). Both the hint and the retry problem must pass
 * the content gate (docs/content-gate.md) before being served; a rejected
 * attempt is regenerated once with the failure reasons injected into the
 * prompt, then falls back to a static subtopic hint and an unused bank
 * problem of the same subtopic/level.
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
  const maxAttempts = 2;
  let previousFailureReasons = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      previous_failure_reasons: previousFailureReasons,
    });

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
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      const retryVerdict = await gateContent(
        { kind: "retry_problem", problem: parsed.retry_problem },
        config
      );
      await recordGenerationAudit({
        kind: "retry_problem",
        pass: retryVerdict.pass,
        reasons: retryVerdict.reasons,
        attempt,
        model: GENERATION_MODEL,
        inputTokens,
        outputTokens,
        problemId: problem.id,
        content: JSON.stringify(parsed.retry_problem),
      });

      const hintVerdict = await gateContent(
        { kind: "hint", hintText: parsed.hint, answer: problem.answer as unknown as Answer },
        config
      );
      await recordGenerationAudit({
        kind: "hint",
        pass: hintVerdict.pass,
        reasons: hintVerdict.reasons,
        attempt,
        model: GENERATION_MODEL,
        inputTokens,
        outputTokens,
        problemId: problem.id,
        content: parsed.hint,
      });

      if (!retryVerdict.pass || !hintVerdict.pass) {
        const reasons = [...retryVerdict.reasons, ...hintVerdict.reasons];
        previousFailureReasons = `Previous attempt rejected because: ${reasons.join("; ")}. Fix these issues.`;
        continue;
      }

      const saved = await saveVerifiedProblem(problem.chapterId, parsed.retry_problem);
      return { hint: parsed.hint, encouragement: parsed.encouragement, retryProblem: saved };
    } catch {
      previousFailureReasons =
        "Previous attempt failed to generate or parse as valid JSON. Follow the response format exactly.";
    }
  }

  return {
    hint: fallbackHintFor(config, problem.subtopicId, problem.hint),
    encouragement: "Keep going, you've got this!",
    retryProblem: await fetchBankFallback(
      problem.chapterId,
      problem.subtopicId,
      problem.level,
      problem.id
    ),
  };
}
