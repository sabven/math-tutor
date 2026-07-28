import { isParentAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginAction, logoutAction } from "./actions";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authed = await isParentAuthenticated();
  const { error } = await searchParams;

  if (!authed) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <form action={loginAction} className="flex flex-col gap-3 w-full max-w-xs">
          <h1 className="text-xl font-semibold text-center">Parent Login</h1>
          <input
            type="password"
            name="pin"
            placeholder="PIN"
            inputMode="numeric"
            autoFocus
            className="border rounded px-3 py-2"
            required
          />
          {error && <p className="text-red-600 text-sm">Incorrect PIN</p>}
          <button type="submit" className="bg-blue-600 text-white rounded py-2 font-medium">
            Unlock
          </button>
        </form>
      </main>
    );
  }

  const sessions = await prisma.session.findMany({
    orderBy: { date: "desc" },
    include: { attempts: true, student: true },
    take: 30,
  });

  return (
    <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <form action={logoutAction}>
          <button className="text-sm text-neutral-500 underline">Log out</button>
        </form>
      </div>

      <div className="space-y-6">
        {sessions.map((s) => (
          <div key={s.id} className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="flex justify-between text-sm text-neutral-500 mb-2">
              <span>
                {s.student.name} — {new Date(s.date).toLocaleString()}
              </span>
              <span>
                {s.status}
                {s.score != null ? ` — ${s.score}/${s.attempts.length}` : ""}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-4">#</th>
                  <th className="pr-4">Correct</th>
                  <th className="pr-4">Seconds</th>
                  <th>Misconception</th>
                </tr>
              </thead>
              <tbody>
                {s.attempts.map((a, i) => (
                  <tr key={a.id}>
                    <td className="pr-4">{i + 1}</td>
                    <td className="pr-4">{a.correct ? "✓" : "✗"}</td>
                    <td className="pr-4">{a.seconds}</td>
                    <td>{a.misconceptionId ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {sessions.length === 0 && <p className="text-neutral-500">No sessions yet.</p>}
      </div>
    </main>
  );
}
