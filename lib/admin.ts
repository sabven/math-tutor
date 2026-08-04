import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export type CreateFamilyInput = {
  familyName: string;
  username: string;
  password: string;
  existingStudentId?: string;
  newStudentName?: string;
};

export type CreateFamilyResult =
  | { ok: true; familyId: string }
  | { ok: false; error: "missing" | "create-failed" };

/**
 * Creates a Family login and attaches it to a Student - either a brand-new
 * one, or an existing unclaimed row (familyId still null), which is how a
 * student created before multi-family accounts existed gets a real login.
 * Pulled out of the "use server" action so this can be unit-tested directly
 * without going through Next's form-action dispatch.
 */
export async function createFamily(input: CreateFamilyInput): Promise<CreateFamilyResult> {
  const familyName = input.familyName.trim();
  const username = input.username.trim().toLowerCase();
  const password = input.password;
  const existingStudentId = input.existingStudentId?.trim() ?? "";
  const newStudentName = input.newStudentName?.trim() ?? "";

  if (!familyName || !username || !password || (!existingStudentId && !newStudentName)) {
    return { ok: false, error: "missing" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const familyId = await prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: { name: familyName, username, passwordHash },
      });
      if (existingStudentId) {
        // Extra `familyId: null` filter guards against a race where the
        // student was claimed by another admin action since the page loaded.
        await tx.student.update({
          where: { id: existingStudentId, familyId: null },
          data: { familyId: family.id },
        });
      } else {
        await tx.student.create({
          data: { name: newStudentName, familyId: family.id },
        });
      }
      return family.id;
    });
    return { ok: true, familyId };
  } catch {
    return { ok: false, error: "create-failed" };
  }
}
