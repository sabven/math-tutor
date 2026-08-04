"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getAdminPasswordHash, setAdminAuthCookie } from "@/lib/adminAuth";

export async function adminLoginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const hash = getAdminPasswordHash();
  const matches = hash.length > 0 && (await bcrypt.compare(password, hash));

  if (!matches) {
    redirect("/admin/login?error=1");
  }

  await setAdminAuthCookie();
  redirect("/admin");
}
