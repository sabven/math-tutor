import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const { score, medianSeconds, perfect } = body as {
    score: number;
    medianSeconds: number;
    perfect: boolean;
  };

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "complete", score, medianSeconds, perfect },
  });

  return NextResponse.json(session);
}
