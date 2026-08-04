import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { adminLogoutAction, createFamilyAction } from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { error } = await searchParams;

  const [families, unclaimedStudents] = await Promise.all([
    prisma.family.findMany({
      orderBy: { createdAt: "desc" },
      include: { students: true },
    }),
    prisma.student.findMany({ where: { familyId: null }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <form action={adminLogoutAction}>
          <button className="text-sm text-neutral-500 underline">Log out</button>
        </form>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold mb-3">Families</h2>
        <div className="space-y-2">
          {families.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{f.name}</span>{" "}
                <span className="text-neutral-500">
                  — {f.students.map((s) => s.name).join(", ") || "no student"} — @{f.username}
                </span>
              </span>
              <span className="text-xs text-neutral-400">
                {new Date(f.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
          {families.length === 0 && <p className="text-sm text-neutral-500">No families yet.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <h2 className="text-sm font-semibold mb-4">Create family</h2>
        <form action={createFamilyAction} className="flex flex-col gap-4 text-sm max-w-md">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Family name</span>
            <input
              name="familyName"
              required
              placeholder="The Tans"
              className="border rounded px-2 py-1 bg-transparent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Username</span>
            <input
              name="username"
              required
              placeholder="tans"
              className="border rounded px-2 py-1 bg-transparent"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Password</span>
            <input
              type="text"
              name="password"
              required
              className="border rounded px-2 py-1 bg-transparent"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">Kid</span>
            {unclaimedStudents.length > 0 && (
              <label className="flex items-center gap-2">
                <input type="radio" name="studentMode" value="existing" defaultChecked />
                <select name="existingStudentId" className="border rounded px-2 py-1 bg-transparent flex-1">
                  {unclaimedStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (existing, unclaimed)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="studentMode"
                value="new"
                defaultChecked={unclaimedStudents.length === 0}
              />
              <input
                name="newStudentName"
                placeholder="New kid's name"
                className="border rounded px-2 py-1 bg-transparent flex-1"
              />
            </label>
          </div>

          {error && (
            <p className="text-red-600 text-xs">
              {error === "missing" ? "Fill in every field." : "Couldn't create that family (username taken?)."}
            </p>
          )}

          <button type="submit" className="self-start bg-blue-600 text-white rounded px-4 py-1.5">
            Create family
          </button>
        </form>
      </section>
    </main>
  );
}
