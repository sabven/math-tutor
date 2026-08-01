import { prisma } from "./prisma";
import { startOfDay, endOfDay } from "./date";
import {
  buildAdaptiveBatchSpec,
  buildStudentState,
  generateAndSaveBatch,
  shuffle,
  BatchSpecEntry,
  ChapterConfig,
} from "./generation";

/**
 * Pulls unused verified problems matching each batch spec entry's exact
 * (subtopicId, level) from the bank, generating fresh ones to fill any
 * shortfall, then returns the combined, shuffled set.
 */
async function fillBatchFromBank(
  chapterId: string,
  studentId: string,
  currentLevel: number,
  batchSpec: BatchSpecEntry[]
): Promise<Awaited<ReturnType<typeof prisma.problem.findMany>>> {
  const picked: Awaited<ReturnType<typeof prisma.problem.findMany>> = [];
  // Picked rows aren't marked usedAt until the whole batch is finalized, so
  // without this, a shortfall re-query could hand back the same row a
  // preceding iteration already picked for a different entry.
  const pickedIds = new Set<string>();
  const shortfall: BatchSpecEntry[] = [];

  for (const entry of batchSpec) {
    const available = await prisma.problem.findMany({
      where: {
        chapterId,
        subtopicId: entry.subtopic_id,
        level: entry.level,
        verified: true,
        usedAt: null,
        id: { notIn: Array.from(pickedIds) },
      },
      orderBy: { createdAt: "asc" },
      take: entry.count,
    });
    picked.push(...available);
    available.forEach((p) => pickedIds.add(p.id));
    if (available.length < entry.count) {
      shortfall.push({ ...entry, count: entry.count - available.length });
    }
  }

  if (shortfall.length > 0) {
    const config = (await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } }))
      .config as unknown as ChapterConfig;
    const studentState = await buildStudentState(studentId, config, currentLevel);
    const shortfallTotal = shortfall.reduce((sum, e) => sum + e.count, 0);
    await generateAndSaveBatch(chapterId, shortfallTotal, shortfall, studentState);

    for (const entry of shortfall) {
      const fresh = await prisma.problem.findMany({
        where: {
          chapterId,
          subtopicId: entry.subtopic_id,
          level: entry.level,
          verified: true,
          usedAt: null,
          id: { notIn: Array.from(pickedIds) },
        },
        orderBy: { createdAt: "asc" },
        take: entry.count,
      });
      picked.push(...fresh);
      fresh.forEach((p) => pickedIds.add(p.id));
    }
  }

  return shuffle(picked);
}

type StudentForSession = {
  id: string;
  currentLevel: number;
  sessionLength: number | null;
  activeSubtopicIds: unknown;
};

/**
 * Builds and saves a brand-new session. Problems are pulled from the bank's
 * unused pool (or freshly generated) and immediately marked usedAt, so a
 * problem already served in any past session never gets picked again.
 */
async function generateNewSession(chapterId: string, student: StudentForSession) {
  const now = new Date();
  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const config = chapter.config as unknown as ChapterConfig;
  const batchSize = student.sessionLength ?? config.session_defaults.problems_per_session;

  const batchSpec = await buildAdaptiveBatchSpec(
    config,
    student.id,
    student.currentLevel,
    batchSize,
    student.activeSubtopicIds as string[] | null
  );
  const problems = await fillBatchFromBank(chapterId, student.id, student.currentLevel, batchSpec);
  const problemIds = problems.map((p) => p.id);

  await prisma.problem.updateMany({
    where: { id: { in: problemIds } },
    data: { usedAt: now },
  });

  const session = await prisma.session.create({
    data: {
      studentId: student.id,
      date: now,
      status: "active",
      problemIds,
    },
  });

  return { session, problems };
}

export async function getOrCreateTodaySession(chapterId = "fractions") {
  const student = await prisma.student.findFirstOrThrow();
  const now = new Date();

  const existing = await prisma.session.findFirst({
    where: {
      studentId: student.id,
      date: { gte: startOfDay(now), lte: endOfDay(now) },
      status: { in: ["pending", "active"] },
    },
    orderBy: { date: "desc" },
  });

  if (existing) {
    const problemIds = existing.problemIds as string[];
    const problems = await prisma.problem.findMany({
      where: { id: { in: problemIds } },
    });
    const ordered = problemIds
      .map((id) => problems.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    return { session: existing, problems: ordered };
  }

  return generateNewSession(chapterId, student);
}

// Always starts a fresh session, regardless of whether one already exists
// for today — used by the "Play again" flow after a session is completed.
export async function startNewSession(chapterId = "fractions") {
  const student = await prisma.student.findFirstOrThrow();
  return generateNewSession(chapterId, student);
}
