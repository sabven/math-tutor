import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChapterConfig } from "@/lib/generation";
import { applyLevelChange, checkLevelChange, updateSkillScore } from "@/lib/elo";
import { generateHintAndRetry, StoredOption } from "@/lib/hintRetry";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const { problemId, chosenOptionIdx, seconds } = body as {
    problemId: string;
    chosenOptionIdx: number;
    seconds: number;
  };

  const [problem, session] = await Promise.all([
    prisma.problem.findUniqueOrThrow({ where: { id: problemId } }),
    prisma.session.findUniqueOrThrow({ where: { id: sessionId } }),
  ]);

  // A stale browser tab left open across a day boundary can still hold an
  // already-finished session in memory and try to keep posting answers to
  // it. Reject those instead of silently recording replay data.
  if (session.status === "complete") {
    return NextResponse.json({ error: "session_ended" }, { status: 410 });
  }

  const options = problem.options as unknown as StoredOption[];
  const chosen = options[chosenOptionIdx];
  const correctIdx = options.findIndex((o) => o.is_correct);
  const correct = Boolean(chosen?.is_correct);

  await prisma.attempt.create({
    data: {
      sessionId,
      problemId,
      chosenOptionIdx,
      correct,
      seconds,
      misconceptionId: correct ? null : chosen?.misconception_id ?? null,
    },
  });

  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: problem.chapterId } });
  const config = chapter.config as unknown as ChapterConfig;
  const speedTarget = config.speed_targets_seconds[String(problem.level)] ?? 60;

  await updateSkillScore(
    session.studentId,
    problem.subtopicId,
    problem.level,
    correct,
    seconds,
    speedTarget
  );

  const student = await prisma.student.findUniqueOrThrow({ where: { id: session.studentId } });
  const levelUpSpeedTarget = student.speedTargetsEnabled ? speedTarget : Infinity;
  const levelChange = await checkLevelChange(session.studentId, student.currentLevel, levelUpSpeedTarget);
  const maxLevel = Math.min(
    config.difficulty_ladder.length,
    student.difficultyCeiling ?? config.difficulty_ladder.length
  );
  const newLevel = await applyLevelChange(
    session.studentId,
    student.currentLevel,
    levelChange,
    maxLevel
  );

  if (correct) {
    return NextResponse.json({
      correct,
      correctIdx,
      solutionSteps: problem.solutionSteps,
      levelChange,
      newLevel,
    });
  }

  const { hint, encouragement, retryProblem } = await generateHintAndRetry(
    problem,
    chosen ?? { display: "", is_correct: false, misconception_id: null },
    config,
    seconds
  );

  if (retryProblem) {
    await prisma.problem.update({ where: { id: retryProblem.id }, data: { usedAt: new Date() } });
    const problemIds = session.problemIds as string[];
    await prisma.session.update({
      where: { id: sessionId },
      data: { problemIds: [...problemIds, retryProblem.id] },
    });
  }

  return NextResponse.json({
    correct,
    correctIdx,
    solutionSteps: problem.solutionSteps,
    hint,
    encouragement,
    levelChange,
    newLevel,
    retryProblem: retryProblem
      ? {
          id: retryProblem.id,
          statement: retryProblem.statement,
          statementLatex: retryProblem.statementLatex,
          options: retryProblem.options,
          hint: retryProblem.hint,
          solutionSteps: retryProblem.solutionSteps,
          estimatedSeconds: retryProblem.estimatedSeconds,
        }
      : null,
  });
}
