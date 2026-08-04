import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { getAdminPasswordHash } from "@/lib/adminAuth";

describe("getAdminPasswordHash", () => {
  const original = process.env.ADMIN_PASSWORD_HASH_B64;

  afterEach(() => {
    process.env.ADMIN_PASSWORD_HASH_B64 = original;
  });

  it("decodes the base64-wrapped bcrypt hash back to a hash bcrypt can compare against", async () => {
    const password = "a-test-admin-password";
    const hash = await bcrypt.hash(password, 10);
    process.env.ADMIN_PASSWORD_HASH_B64 = Buffer.from(hash).toString("base64");

    const decoded = getAdminPasswordHash();
    expect(decoded).toBe(hash);
    expect(await bcrypt.compare(password, decoded)).toBe(true);
  });

  it("throws when ADMIN_PASSWORD_HASH_B64 is not set", () => {
    delete process.env.ADMIN_PASSWORD_HASH_B64;
    expect(() => getAdminPasswordHash()).toThrow();
  });
});
