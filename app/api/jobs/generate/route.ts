import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildAdaptiveBatchSpec,
  buildStudentState,
  generateAndSaveBatch,
  ChapterConfig,
  BatchSpecEntry,
} from "@/lib/generation";
import type { Student } from "@prisma/client";

async function generateForStudent(
  student: Student,
  chapterId: string,
  config: ChapterConfig,
  explicitBatchSize: number | undefined
) {
  const batchSize: number =
    explicitBatchSize ?? student.sessionLength ?? config.session_defaults.problems_per_session;
  const batchSpec: BatchSpecEntry[] = await buildAdaptiveBatchSpec(
    config,
    student.id,
    student.currentLevel,
    batchSize,
    student.activeSubtopicIds as string[] | null
  );
  const studentState = await buildStudentState(student.id, config, student.currentLevel);

  return generateAndSaveBatch(chapterId, batchSize, batchSpec, studentState);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (!secret || secret !== process.env.JOB_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const chapterId: string = body.chapterId ?? "fractions";

  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const config = chapter.config as unknown as ChapterConfig;

  if (body.studentId) {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: body.studentId } });
    const result = await generateForStudent(student, chapterId, config, body.batchSize);
    return NextResponse.json(result);
  }

  // No studentId: nightly-batch cron case — pre-generate tomorrow's session
  // for every family's kid, not just one.
  const students = await prisma.student.findMany();
  const results = [];
  for (const student of students) {
    const result = await generateForStudent(student, chapterId, config, body.batchSize);
    results.push({ studentId: student.id, ...result });
  }

  return NextResponse.json({ results });
}
