import { cookies } from "next/headers";

const COOKIE_NAME = "admin_auth";

export function getAdminPasswordHash(): string {
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64;
  if (!b64) throw new Error("ADMIN_PASSWORD_HASH_B64 is not set");
  return Buffer.from(b64, "base64").toString("utf-8");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return Boolean(value) && value === getAdminPasswordHash();
}

export async function setAdminAuthCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, getAdminPasswordHash(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearAdminAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
