import { getOrCreateTodaySession } from "@/lib/session";
import { getPointsBalance } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { PlayClient, PlayProblem } from "./PlayClient";

// Reads/writes today's session via Prisma directly (no fetch/cookies/headers),
// so without this Next statically prerenders the page and bakes in one
// sessionId at build time — every visitor then hits whichever session that
// build happened to create, including ones already marked complete.
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const { session, problems } = await getOrCreateTodaySession();

  const clientProblems: PlayProblem[] = problems.map((p) => ({
    id: p.id,
    statement: p.statement,
    statementLatex: p.statementLatex,
    options: p.options as unknown as PlayProblem["options"],
    hint: p.hint,
    solutionSteps: p.solutionSteps as unknown as string[],
    estimatedSeconds: p.estimatedSeconds,
  }));

  const student = await prisma.student.findUniqueOrThrow({ where: { id: session.studentId } });
  const initialPointsBalance = await getPointsBalance(student.id);

  return (
    <PlayClient
      sessionId={session.id}
      problems={clientProblems}
      initialPointsBalance={initialPointsBalance}
    />
  );
}
