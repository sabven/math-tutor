"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { clearParentAuthCookie, getParentPinHash, setParentAuthCookie } from "@/lib/auth";

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
