import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Family, Student } from "@prisma/client";

const COOKIE_NAME = "family_session";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

export function sign(familyId: string): string {
  return createHmac("sha256", getSessionSecret()).update(familyId).digest("hex");
}

export function verifySignature(familyId: string, signature: string): boolean {
  const expected = Buffer.from(sign(familyId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function verifyFamilyCredentials(
  username: string,
  password: string
): Promise<Family | null> {
  const family = await prisma.family.findUnique({ where: { username } });
  if (!family) return null;
  const matches = await bcrypt.compare(password, family.passwordHash);
  return matches ? family : null;
}

export async function setFamilySessionCookie(familyId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, `${familyId}.${sign(familyId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearFamilySessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type FamilySession = {
  familyId: string;
  family: Family;
  student: Student;
};

/**
 * Resolves the logged-in family and its (sole, for now) student in one call
 * so every page/route derives "which kid" from the same place instead of
 * re-deriving it. Returns null if there's no valid session, no matching
 * family, or the family has no student yet (shouldn't happen once /admin
 * always creates them together, but a family mid-setup could be un-owned).
 */
export async function getFamilySession(): Promise<FamilySession | null> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  if (!value) return null;

  const dotIndex = value.indexOf(".");
  if (dotIndex === -1) return null;
  const familyId = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  if (!verifySignature(familyId, signature)) return null;

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    include: { students: true },
  });
  if (!family) return null;
  const student = family.students[0];
  if (!student) return null;

  return { familyId, family, student };
}
