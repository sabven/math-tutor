"use server";

import { redirect } from "next/navigation";
import { isAdminAuthenticated, clearAdminAuthCookie } from "@/lib/adminAuth";
import { createFamily } from "@/lib/admin";

export async function adminLogoutAction() {
  await clearAdminAuthCookie();
  redirect("/admin/login");
}

export async function createFamilyAction(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const studentMode = String(formData.get("studentMode") ?? "");
  // The <select> and the "new name" text input are both always present in
  // the form regardless of which radio is checked, so only trust whichever
  // one studentMode actually points at.
  const result = await createFamily({
    familyName: String(formData.get("familyName") ?? ""),
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    existingStudentId:
      studentMode === "existing" ? String(formData.get("existingStudentId") ?? "") : undefined,
    newStudentName:
      studentMode === "new" ? String(formData.get("newStudentName") ?? "") : undefined,
  });

  if (!result.ok) {
    redirect(`/admin?error=${result.error}`);
  }

  redirect("/admin");
}
