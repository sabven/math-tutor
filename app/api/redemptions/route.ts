import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPointsBalance } from "@/lib/points";
import { getFamilySession } from "@/lib/familyAuth";

export async function POST(req: NextRequest) {
  const familySession = await getFamilySession();
  if (!familySession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { perkId } = body as { perkId: string };

  const student = familySession.student;
  const perk = await prisma.perk.findUniqueOrThrow({ where: { id: perkId } });

  if (!perk.active) {
    return NextResponse.json({ error: "perk_unavailable" }, { status: 400 });
  }

  const balance = await getPointsBalance(student.id);
  if (balance < perk.pointCost) {
    return NextResponse.json({ error: "insufficient_points", balance }, { status: 400 });
  }

  const redemption = await prisma.$transaction(async (tx) => {
    const created = await tx.redemption.create({
      data: { studentId: student.id, perkId: perk.id, status: "pending" },
    });
    await tx.pointsLedger.create({
      data: {
        studentId: student.id,
        delta: -perk.pointCost,
        reason: `redeem:${created.id}`,
      },
    });
    return created;
  });

  const newBalance = await getPointsBalance(student.id);
  return NextResponse.json({ redemption, balance: newBalance });
}
