import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPointsBalance } from "@/lib/points";
import { getFamilySession } from "@/lib/familyAuth";
import { ShopClient } from "./ShopClient";

// See app/play/page.tsx for why this is needed: no fetch/cookies/headers
// usage here means Next would otherwise statically cache this page and
// serve one build-time snapshot of balance/redemptions to every visitor.
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const familySession = await getFamilySession();
  if (!familySession) {
    redirect("/login");
  }
  const student = familySession.student;

  const [perks, redemptions, balance] = await Promise.all([
    prisma.perk.findMany({ where: { active: true }, orderBy: { pointCost: "asc" } }),
    prisma.redemption.findMany({
      where: { studentId: student.id },
      orderBy: { createdAt: "desc" },
      include: { perk: true },
      take: 20,
    }),
    getPointsBalance(student.id),
  ]);

  return (
    <ShopClient
      balance={balance}
      perks={perks.map((p) => ({ id: p.id, name: p.name, pointCost: p.pointCost, icon: p.icon }))}
      redemptions={redemptions.map((r) => ({
        id: r.id,
        perkName: r.perk.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
