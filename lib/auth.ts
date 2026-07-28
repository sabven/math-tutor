import { cookies } from "next/headers";

const COOKIE_NAME = "parent_auth";

export function getParentPinHash(): string {
  const b64 = process.env.PARENT_PIN_HASH_B64;
  if (!b64) throw new Error("PARENT_PIN_HASH_B64 is not set");
  return Buffer.from(b64, "base64").toString("utf-8");
}

export async function isParentAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  return Boolean(value) && value === getParentPinHash();
}

export async function setParentAuthCookie() {
  const store = await cookies();
  store.set(COOKIE_NAME, getParentPinHash(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

export async function clearParentAuthCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
