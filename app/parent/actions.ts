"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import {
  clearParentAuthCookie,
  getParentPinHash,
  isParentAuthenticated,
  setParentAuthCookie,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function loginAction(formData: FormData) {
  const pin = String(formData.get("pin") ?? "");
  const hash = getParentPinHash();
  const matches = hash.length > 0 && (await bcrypt.compare(pin, hash));

  if (!matches) {
    redirect("/parent?error=1");
  }

  await setParentAuthCookie();
  redirect("/parent");
}

export async function logoutAction() {
  await clearParentAuthCookie();
  redirect("/parent");
}

export async function updateSettingsAction(formData: FormData) {
  if (!(await isParentAuthenticated())) {
    redirect("/parent");
  }

  const student = await prisma.student.findFirstOrThrow();

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
  if (!(await isParentAuthenticated())) {
    redirect("/parent");
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
  if (!(await isParentAuthenticated())) {
    redirect("/parent");
  }

  const perkId = String(formData.get("perkId") ?? "");
  const perk = await prisma.perk.findUniqueOrThrow({ where: { id: perkId } });
  await prisma.perk.update({ where: { id: perkId }, data: { active: !perk.active } });

  redirect("/parent");
}

export async function grantRedemptionAction(formData: FormData) {
  if (!(await isParentAuthenticated())) {
    redirect("/parent");
  }

  const redemptionId = String(formData.get("redemptionId") ?? "");
  await prisma.redemption.update({
    where: { id: redemptionId },
    data: { status: "granted" },
  });

  redirect("/parent");
}
