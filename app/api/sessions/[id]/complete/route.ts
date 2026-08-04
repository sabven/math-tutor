import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardSessionCompletionBonuses, getPointsBalance } from "@/lib/points";
import { getFamilySession } from "@/lib/familyAuth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const familySession = await getFamilySession();
  if (!familySession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const body = await req.json();
  const { score, medianSeconds, perfect } = body as {
    score: number;
    medianSeconds: number;
    perfect: boolean;
  };

  const existing = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (existing.studentId !== familySession.student.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "complete", score, medianSeconds, perfect },
  });

  const problemIds = session.problemIds as string[];
  const firstProblem = problemIds.length
    ? await prisma.problem.findUnique({ where: { id: problemIds[0] } })
    : null;
  const student = familySession.student;

  let pointsAwarded = 0;
  if (firstProblem) {
    pointsAwarded = await awardSessionCompletionBonuses(
      session.studentId,
      session.id,
      medianSeconds,
      perfect,
      firstProblem.chapterId,
      student.currentLevel
    );
  }
  const pointsBalance = await getPointsBalance(session.studentId);

  return NextResponse.json({ ...session, pointsAwarded, pointsBalance });
}
