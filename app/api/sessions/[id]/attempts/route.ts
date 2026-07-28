import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface StoredOption {
  display: string;
  is_correct: boolean;
  misconception_id: string | null;
}

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

  const problem = await prisma.problem.findUniqueOrThrow({ where: { id: problemId } });
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

  return NextResponse.json({
    correct,
    correctIdx,
    hint: problem.hint,
    solutionSteps: problem.solutionSteps,
  });
}
