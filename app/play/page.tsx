import { redirect } from "next/navigation";
import { getOrCreateTodaySession } from "@/lib/session";
import { getPointsBalance } from "@/lib/points";
import { getFamilySession } from "@/lib/familyAuth";
import { prisma } from "@/lib/prisma";
import type { ChapterConfig } from "@/lib/generation";
import { PlayClient, PlayProblem } from "./PlayClient";
import { PlaySessionClient } from "./PlaySessionClient";
import type { PrimerSubtopic } from "./ConceptPrimer";

// Reads/writes today's session via Prisma directly (no fetch/cookies/headers),
// so without this Next statically prerenders the page and bakes in one
// sessionId at build time — every visitor then hits whichever session that
// build happened to create, including ones already marked complete.
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const familySession = await getFamilySession();
  if (!familySession) {
    redirect("/login");
  }

  const { session, problems } = await getOrCreateTodaySession(familySession.student.id);

  const clientProblems: PlayProblem[] = problems.map((p) => ({
    id: p.id,
    subtopicId: p.subtopicId,
    statement: p.statement,
    statementLatex: p.statementLatex,
    options: p.options as unknown as PlayProblem["options"],
    hint: p.hint,
    solutionSteps: p.solutionSteps as unknown as string[],
    estimatedSeconds: p.estimatedSeconds,
  }));

  const initialPointsBalance = await getPointsBalance(familySession.student.id);

  if (problems.length === 0) {
    return (
      <PlayClient
        sessionId={session.id}
        problems={clientProblems}
        initialPointsBalance={initialPointsBalance}
      />
    );
  }

  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: problems[0].chapterId } });
  const config = chapter.config as unknown as ChapterConfig;
  const distinctSubtopicIds = Array.from(new Set(problems.map((p) => p.subtopicId)));
  const primerSubtopics: PrimerSubtopic[] = distinctSubtopicIds
    .map((id) => config.subtopics.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ id: s.id, name: s.name, lesson: s.lesson }));

  return (
    <PlaySessionClient
      sessionId={session.id}
      problems={clientProblems}
      initialPointsBalance={initialPointsBalance}
      subtopics={primerSubtopics}
    />
  );
}
