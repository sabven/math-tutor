import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createFamily } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

describe("createFamily", () => {
  const prefix = `unit-createfamily-${Date.now()}`;
  let unclaimedStudentId: string;
  let alreadyClaimedStudentId: string;

  beforeAll(async () => {
    const unclaimed = await prisma.student.create({
      data: { name: `${prefix}-unclaimed-kid` },
    });
    unclaimedStudentId = unclaimed.id;

    const ownerFamily = await prisma.family.create({
      data: { name: `${prefix}-owner`, username: `${prefix}-owner`, passwordHash: "x" },
    });
    const claimed = await prisma.student.create({
      data: { name: `${prefix}-claimed-kid`, familyId: ownerFamily.id },
    });
    alreadyClaimedStudentId = claimed.id;
  });

  afterAll(async () => {
    // Students reference families via familyId, so they must go first.
    await prisma.student.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.family.deleteMany({ where: { username: { startsWith: prefix } } });
  });

  it("creates a family and a brand-new student together", async () => {
    const result = await createFamily({
      familyName: "New Family",
      username: `${prefix}-new`,
      password: "pw",
      newStudentName: `${prefix}-brand-new-kid`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const student = await prisma.student.findFirst({
      where: { familyId: result.familyId },
    });
    expect(student?.name).toBe(`${prefix}-brand-new-kid`);
  });

  it("attaches an existing unclaimed student instead of creating a new one", async () => {
    const result = await createFamily({
      familyName: "Linking Family",
      username: `${prefix}-linker`,
      password: "pw",
      existingStudentId: unclaimedStudentId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const student = await prisma.student.findUnique({ where: { id: unclaimedStudentId } });
    expect(student?.familyId).toBe(result.familyId);

    const studentsInFamily = await prisma.student.count({ where: { familyId: result.familyId } });
    expect(studentsInFamily).toBe(1);
  });

  it("refuses to steal a student that's already claimed by another family", async () => {
    const result = await createFamily({
      familyName: "Thief Family",
      username: `${prefix}-thief`,
      password: "pw",
      existingStudentId: alreadyClaimedStudentId,
    });
    expect(result.ok).toBe(false);

    // Nothing should have been left behind: the family create is rolled
    // back with the student update inside the same transaction.
    const orphanFamily = await prisma.family.findUnique({
      where: { username: `${prefix}-thief` },
    });
    expect(orphanFamily).toBeNull();

    // And the original owner still has it.
    const student = await prisma.student.findUnique({ where: { id: alreadyClaimedStudentId } });
    expect(student?.familyId).not.toBeNull();
  });

  it("rejects a duplicate username", async () => {
    const first = await createFamily({
      familyName: "Original",
      username: `${prefix}-dupe`,
      password: "pw",
      newStudentName: `${prefix}-dupe-kid-1`,
    });
    expect(first.ok).toBe(true);

    const second = await createFamily({
      familyName: "Impersonator",
      username: `${prefix}-dupe`,
      password: "pw",
      newStudentName: `${prefix}-dupe-kid-2`,
    });
    expect(second).toEqual({ ok: false, error: "create-failed" });
  });

  it("rejects missing required fields without touching the database", async () => {
    const result = await createFamily({
      familyName: "",
      username: `${prefix}-incomplete`,
      password: "pw",
      newStudentName: `${prefix}-incomplete-kid`,
    });
    expect(result).toEqual({ ok: false, error: "missing" });

    const family = await prisma.family.findUnique({
      where: { username: `${prefix}-incomplete` },
    });
    expect(family).toBeNull();
  });

  it("rejects when neither an existing nor a new student is specified", async () => {
    const result = await createFamily({
      familyName: "No Kid Family",
      username: `${prefix}-nokid`,
      password: "pw",
    });
    expect(result).toEqual({ ok: false, error: "missing" });
  });
});
