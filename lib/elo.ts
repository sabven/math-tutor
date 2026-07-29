import { prisma } from "./prisma";

const K_FACTOR = 32;

/**
 * Maps a difficulty level (1-10) to an implicit "problem rating" on the same
 * scale as student Elo (starting_score 1000). Roughly anchored so level 5
 * (mid-ladder) sits at 1000 — matching mastered_threshold (elo >= 1200)
 * to consistent success a couple levels above a student's starting point.
 */
export function problemRatingForLevel(level: number): number {
  return 700 + level * 60;
}

export function updateElo(
  currentElo: number,
  level: number,
  correct: boolean,
  seconds: number,
  speedTargetSeconds: number
): number {
  const problemRating = problemRatingForLevel(level);
  const expected = 1 / (1 + Math.pow(10, (problemRating - currentElo) / 400));
  const actual = correct ? 1 : 0;
  // A correct answer well within the speed target is a stronger signal than
  // a slow correct answer; a wrong answer counts fully regardless of speed.
  const timeFactor = correct && seconds > speedTargetSeconds ? 0.7 : 1.0;
  const delta = K_FACTOR * timeFactor * (actual - expected);
  const next = Math.round(currentElo + delta);
  return Math.max(400, Math.min(2000, next));
}

export async function updateSkillScore(
  studentId: string,
  subtopicId: string,
  level: number,
  correct: boolean,
  seconds: number,
  speedTargetSeconds: number
): Promise<number> {
  const existing = await prisma.skillScore.findUnique({
    where: { studentId_subtopicId: { studentId, subtopicId } },
  });
  const currentElo = existing?.elo ?? 1000;
  const nextElo = updateElo(currentElo, level, correct, seconds, speedTargetSeconds);

  await prisma.skillScore.upsert({
    where: { studentId_subtopicId: { studentId, subtopicId } },
    update: { elo: nextElo },
    create: { studentId, subtopicId, elo: nextElo },
  });

  return nextElo;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export type LevelChange = "up" | "down" | null;

export async function checkLevelChange(
  studentId: string,
  level: number,
  speedTargetSeconds: number
): Promise<LevelChange> {
  const recent = await prisma.attempt.findMany({
    where: { session: { studentId }, problem: { level } },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { problem: true },
  });

  if (recent.length >= 15) {
    const last15 = recent.slice(0, 15);
    const accuracy = last15.filter((a) => a.correct).length / 15;
    const medianSeconds = median(last15.map((a) => a.seconds));
    if (accuracy >= 0.85 && medianSeconds <= speedTargetSeconds) {
      return "up";
    }
  }

  if (recent.length >= 10) {
    const last10 = recent.slice(0, 10);
    const accuracy = last10.filter((a) => a.correct).length / 10;
    if (accuracy < 0.5) {
      return "down";
    }
  }

  return null;
}

export async function applyLevelChange(
  studentId: string,
  currentLevel: number,
  change: LevelChange,
  maxLevel: number
): Promise<number> {
  if (!change) return currentLevel;
  const nextLevel =
    change === "up"
      ? Math.min(maxLevel, currentLevel + 1)
      : Math.max(1, currentLevel - 1);

  if (nextLevel !== currentLevel) {
    await prisma.student.update({
      where: { id: studentId },
      data: { currentLevel: nextLevel },
    });
  }

  return nextLevel;
}
