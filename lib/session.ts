import { prisma } from "./prisma";
import {
  buildAdaptiveBatchSpec,
  buildStudentState,
  generateAndSaveBatch,
  shuffle,
  BatchSpecEntry,
  ChapterConfig,
} from "./generation";

// The family is in Singapore (UTC+8, no DST). "Today" must be computed in
// their local calendar day, not the server's (AWS Lambda defaults to UTC) —
// otherwise the app keeps reusing the previous day's session for a chunk of
// every Singapore day.
const STUDENT_TIMEZONE = "Asia/Singapore";

function localDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDENT_TIMEZONE }).format(date);
}

function startOfDay(date: Date): Date {
  return new Date(`${localDateString(date)}T00:00:00+08:00`);
}

function endOfDay(date: Date): Date {
  return new Date(`${localDateString(date)}T23:59:59.999+08:00`);
}

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
  const shortfall: BatchSpecEntry[] = [];

  for (const entry of batchSpec) {
    const available = await prisma.problem.findMany({
      where: {
        chapterId,
        subtopicId: entry.subtopic_id,
        level: entry.level,
        verified: true,
        usedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: entry.count,
    });
    picked.push(...available);
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
        },
        orderBy: { createdAt: "asc" },
        take: entry.count,
      });
      picked.push(...fresh);
    }
  }

  return shuffle(picked);
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

  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const config = chapter.config as unknown as ChapterConfig;
  const batchSize = config.session_defaults.problems_per_session;

  const batchSpec = await buildAdaptiveBatchSpec(config, student.id, student.currentLevel, batchSize);
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
