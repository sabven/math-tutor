import { prisma } from "./prisma";
import {
  buildBatchSpecForLevel,
  buildStudentState,
  generateAndSaveBatch,
  ChapterConfig,
} from "./generation";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
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

  let bank = await prisma.problem.findMany({
    where: {
      chapterId,
      level: student.currentLevel,
      verified: true,
      usedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (bank.length < batchSize) {
    const batchSpec = buildBatchSpecForLevel(config, student.currentLevel, batchSize);
    const studentState = await buildStudentState(student.id, config, student.currentLevel);
    await generateAndSaveBatch(chapterId, batchSize, batchSpec, studentState);

    bank = await prisma.problem.findMany({
      where: {
        chapterId,
        level: student.currentLevel,
        verified: true,
        usedAt: null,
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
  }

  const problems = bank.slice(0, batchSize);
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
