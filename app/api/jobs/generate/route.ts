import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildBatchSpecForLevel,
  buildStudentState,
  generateAndSaveBatch,
  ChapterConfig,
} from "@/lib/generation";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-job-secret");
  if (!secret || secret !== process.env.JOB_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const chapterId: string = body.chapterId ?? "fractions";

  const student = body.studentId
    ? await prisma.student.findUniqueOrThrow({ where: { id: body.studentId } })
    : await prisma.student.findFirstOrThrow();

  const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  const config = chapter.config as unknown as ChapterConfig;

  const batchSize: number = body.batchSize ?? config.session_defaults.problems_per_session;
  const batchSpec = buildBatchSpecForLevel(config, student.currentLevel, batchSize);
  const studentState = await buildStudentState(student.id, config, student.currentLevel);

  const result = await generateAndSaveBatch(chapterId, batchSize, batchSpec, studentState);

  return NextResponse.json(result);
}
