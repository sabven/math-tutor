import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { sign, verifySignature, verifyFamilyCredentials } from "@/lib/familyAuth";
import { prisma } from "@/lib/prisma";

describe("sign / verifySignature", () => {
  it("accepts a signature produced for the same familyId", () => {
    const familyId = "fam_abc123";
    expect(verifySignature(familyId, sign(familyId))).toBe(true);
  });

  it("rejects a signature for a different familyId (forged cookie)", () => {
    const signatureForOtherFamily = sign("fam_other");
    expect(verifySignature("fam_abc123", signatureForOtherFamily)).toBe(false);
  });

  it("rejects a garbage signature", () => {
    expect(verifySignature("fam_abc123", "not-a-real-signature")).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifySignature("fam_abc123", "")).toBe(false);
  });
});

describe("verifyFamilyCredentials", () => {
  const username = `unit-test-family-${Date.now()}`;
  const password = "correct-horse-battery-staple";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.family.create({
      data: { name: "Unit Test Family", username, passwordHash },
    });
  });

  afterAll(async () => {
    await prisma.family.deleteMany({ where: { username } });
  });

  it("returns the family when the password is correct", async () => {
    const family = await verifyFamilyCredentials(username, password);
    expect(family?.username).toBe(username);
  });

  it("returns null when the password is wrong", async () => {
    const family = await verifyFamilyCredentials(username, "wrong-password");
    expect(family).toBeNull();
  });

  it("returns null for an unknown username", async () => {
    const family = await verifyFamilyCredentials("no-such-family-xyz", password);
    expect(family).toBeNull();
  });
});
