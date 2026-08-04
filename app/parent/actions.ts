"use server";

import { redirect } from "next/navigation";
import { clearFamilySessionCookie, getFamilySession } from "@/lib/familyAuth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function logoutAction() {
  await clearFamilySessionCookie();
  redirect("/login");
}

export async function updateSettingsAction(formData: FormData) {
  const familySession = await getFamilySession();
  if (!familySession) {
    redirect("/login");
  }
  const student = familySession.student;

  const rawSessionLength = String(formData.get("sessionLength") ?? "").trim();
  const sessionLength = rawSessionLength ? Math.max(1, parseInt(rawSessionLength, 10)) : null;

  const rawCeiling = String(formData.get("difficultyCeiling") ?? "").trim();
  const difficultyCeiling = rawCeiling ? parseInt(rawCeiling, 10) : null;

  const speedTargetsEnabled = formData.get("speedTargetsEnabled") === "on";

  const selectedSubtopics = formData.getAll("subtopic").map(String);
  const allKnownSubtopics = formData.getAll("allSubtopic").map(String);

  if (selectedSubtopics.length === 0) {
    redirect("/parent?settingsError=1");
  }

  // If every known subtopic is selected, store null (no restriction) rather
  // than an explicit list, so newly-added subtopics are active by default.
  const activeSubtopicIds =
    selectedSubtopics.length < allKnownSubtopics.length ? selectedSubtopics : null;

  await prisma.student.update({
    where: { id: student.id },
    data: {
      sessionLength,
      difficultyCeiling,
      speedTargetsEnabled,
      activeSubtopicIds: activeSubtopicIds ?? Prisma.DbNull,
    },
  });

  redirect("/parent");
}

export async function addPerkAction(formData: FormData) {
  if (!(await getFamilySession())) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const pointCost = parseInt(String(formData.get("pointCost") ?? ""), 10);
  const icon = String(formData.get("icon") ?? "").trim();

  if (!name || !Number.isFinite(pointCost) || pointCost <= 0) {
    redirect("/parent?perkError=1");
  }

  await prisma.perk.create({
    data: { name, pointCost, icon: icon || null },
  });

  redirect("/parent");
}

export async function togglePerkAction(formData: FormData) {
  if (!(await getFamilySession())) {
    redirect("/login");
  }

  const perkId = String(formData.get("perkId") ?? "");
  const perk = await prisma.perk.findUniqueOrThrow({ where: { id: perkId } });
  await prisma.perk.update({ where: { id: perkId }, data: { active: !perk.active } });

  redirect("/parent");
}

export async function grantRedemptionAction(formData: FormData) {
  const familySession = await getFamilySession();
  if (!familySession) {
    redirect("/login");
  }

  const redemptionId = String(formData.get("redemptionId") ?? "");
  const redemption = await prisma.redemption.findUniqueOrThrow({ where: { id: redemptionId } });
  if (redemption.studentId !== familySession.student.id) {
    redirect("/parent");
  }

  await prisma.redemption.update({
    where: { id: redemptionId },
    data: { status: "granted" },
  });

  redirect("/parent");
}
