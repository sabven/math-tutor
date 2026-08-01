import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardSessionPoints, getPointsBalance } from "@/lib/points";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const { score, medianSeconds, perfect } = body as {
    score: number;
    medianSeconds: number;
    perfect: boolean;
  };

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "complete", score, medianSeconds, perfect },
  });

  const problemIds = session.problemIds as string[];
  const firstProblem = problemIds.length
    ? await prisma.problem.findUnique({ where: { id: problemIds[0] } })
    : null;
  const student = await prisma.student.findUniqueOrThrow({ where: { id: session.studentId } });

  let pointsAwarded = 0;
  if (firstProblem) {
    pointsAwarded = await awardSessionPoints(
      session.studentId,
      session.id,
      score,
      medianSeconds,
      perfect,
      firstProblem.chapterId,
      student.currentLevel
    );
  }
  const pointsBalance = await getPointsBalance(session.studentId);

  return NextResponse.json({ ...session, pointsAwarded, pointsBalance });
}
