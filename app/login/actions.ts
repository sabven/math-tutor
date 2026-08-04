"use server";

import { redirect } from "next/navigation";
import { verifyFamilyCredentials, setFamilySessionCookie } from "@/lib/familyAuth";

export async function familyLoginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const family = await verifyFamilyCredentials(username, password);
  if (!family) {
    redirect("/login?error=1");
  }

  await setFamilySessionCookie(family.id);
  redirect("/play");
}
