import { prisma } from "./prisma";
import type { ChapterConfig } from "./generation";
import { localDateString } from "./date";

const POINTS_PER_CORRECT = 2;
const PERFECT_BONUS = 20;
const SPEED_BONUS = 10;

// Awarded once each, the first time a student's day-streak reaches the
// milestone. Larger gaps reward sticking with it, not just showing up once.
const STREAK_MILESTONES: { days: number; points: number }[] = [
  { days: 3, points: 25 },
  { days: 7, points: 75 },
  { days: 14, points: 150 },
  { days: 30, points: 400 },
];

function toEpochDay(localDateStr: string): number {
  return Math.floor(new Date(`${localDateStr}T00:00:00+08:00`).getTime() / 86400000);
}

/**
 * Consecutive-day streak of completed sessions ending today, computed the
 * same way as the /parent dashboard's streak tile.
 */
async function computeCurrentStreak(studentId: string): Promise<number> {
  const sessions = await prisma.session.findMany({
    where: { studentId, status: "complete" },
    orderBy: { date: "desc" },
    take: 60,
    select: { date: true },
  });
  const datesDesc = Array.from(new Set(sessions.map((s) => localDateString(s.date)))).sort(
    (a, b) => (a < b ? 1 : -1)
  );
  if (datesDesc.length === 0) return 0;

  const todayDay = toEpochDay(localDateString(new Date()));
  const mostRecentDay = toEpochDay(datesDesc[0]);
  if (todayDay - mostRecentDay > 1) return 0;

  let streak = 1;
  let cursor = mostRecentDay;
  for (let i = 1; i < datesDesc.length; i++) {
    const day = toEpochDay(datesDesc[i]);
    if (cursor - day === 1) {
      streak += 1;
      cursor = day;
    } else {
      break;
    }
  }
  return streak;
}

export async function getPointsBalance(studentId: string): Promise<number> {
  const result = await prisma.pointsLedger.aggregate({
    where: { studentId },
    _sum: { delta: true },
  });
  return result._sum.delta ?? 0;
}

/**
 * Awards points for a single correct answer, immediately (called from the
 * attempts route) so the player sees points land right after each question
 * rather than only in a lump sum at the end. Keyed by problemId, which is
 * unique per attempt (retries get a fresh problem row), so this can't be
 * double-awarded for the same question. Answers that needed the one free
 * retry (a wrong pick before the final correct one) earn half points.
 */
export async function awardCorrectAnswerPoints(
  studentId: string,
  problemId: string,
  usedRetry = false
): Promise<number> {
  const points = usedRetry ? Math.max(1, Math.floor(POINTS_PER_CORRECT / 2)) : POINTS_PER_CORRECT;
  await prisma.pointsLedger.create({
    data: {
      studentId,
      delta: points,
      reason: `problem:${problemId}:correct${usedRetry ? ":retry" : ""}`,
    },
  });
  return points;
}

/**
 * Awards the session-level bonuses once a session finishes: a perfect-score
 * bonus, a beat-the-speed-target bonus, and any newly-reached streak
 * milestone. Per-question points are already awarded as they happen via
 * awardCorrectAnswerPoints, so this only ever adds bonuses on top. Each
 * award is its own PointsLedger row for auditability.
 */
export async function awardSessionCompletionBonuses(
  studentId: string,
  sessionId: string,
  medianSeconds: number,
  perfect: boolean,
  chapterId: string,
  level: number
): Promise<number> {
  const entries: { delta: number; reason: string }[] = [];

  if (perfect) {
    entries.push({ delta: PERFECT_BONUS, reason: `session:${sessionId}:perfect` });
  }

  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (chapter) {
    const config = chapter.config as unknown as ChapterConfig;
    const speedTarget = config.speed_targets_seconds[String(level)];
    if (speedTarget && medianSeconds > 0 && medianSeconds <= speedTarget) {
      entries.push({ delta: SPEED_BONUS, reason: `session:${sessionId}:speed` });
    }
  }

  const streak = await computeCurrentStreak(studentId);
  const milestone = STREAK_MILESTONES.find((m) => m.days === streak);
  if (milestone) {
    const reason = `streak:${milestone.days}`;
    const already = await prisma.pointsLedger.findFirst({ where: { studentId, reason } });
    if (!already) {
      entries.push({ delta: milestone.points, reason });
    }
  }

  if (entries.length > 0) {
    await prisma.pointsLedger.createMany({
      data: entries.map((e) => ({ studentId, delta: e.delta, reason: e.reason })),
    });
  }

  return entries.reduce((sum, e) => sum + e.delta, 0);
}
