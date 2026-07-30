import { isParentAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginAction, logoutAction } from "./actions";
import type { ChapterConfig } from "@/lib/generation";
import type { StoredOption } from "@/lib/hintRetry";
import { localDateString } from "@/lib/date";
import { AccuracyTrendChart, MasteryBarChart, SpeedTrendChart } from "./ProgressCharts";

function toEpochDay(localDateStr: string): number {
  return Math.floor(new Date(`${localDateStr}T00:00:00+08:00`).getTime() / 86400000);
}

// Consecutive-day streak of completed sessions, ending at today or yesterday
// (a day not yet started doesn't break the streak, but a real gap does).
function computeStreak(completedDatesDesc: string[]): number {
  if (completedDatesDesc.length === 0) return 0;
  const todayDay = toEpochDay(localDateString(new Date()));
  const mostRecentDay = toEpochDay(completedDatesDesc[0]);
  if (todayDay - mostRecentDay > 1) return 0;

  let streak = 1;
  let cursor = mostRecentDay;
  for (let i = 1; i < completedDatesDesc.length; i++) {
    const day = toEpochDay(completedDatesDesc[i]);
    if (cursor - day === 1) {
      streak += 1;
      cursor = day;
    } else {
      break;
    }
  }
  return streak;
}

function subtopicName(config: ChapterConfig | undefined, id: string): string {
  return config?.subtopics.find((s) => s.id === id)?.name ?? id;
}

function misconceptionInfo(config: ChapterConfig | undefined, id: string | null) {
  if (!id) return null;
  return config?.misconceptions.find((m) => m.id === id) ?? null;
}

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; session?: string; subtopic?: string; show?: string }>;
}) {
  const authed = await isParentAuthenticated();
  const { error, session: sessionParam, subtopic: subtopicParam, show } = await searchParams;

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
    include: {
      student: true,
      attempts: { orderBy: { createdAt: "asc" }, include: { problem: true } },
    },
    take: 30,
  });

  const chapterIds = Array.from(
    new Set(sessions.flatMap((s) => s.attempts.map((a) => a.problem.chapterId)))
  );
  const chapters = await prisma.chapter.findMany({ where: { id: { in: chapterIds } } });
  const configByChapter = new Map(
    chapters.map((c) => [c.id, c.config as unknown as ChapterConfig])
  );

  // All known subtopics across every chapter touched by these sessions, for the concept filter.
  const allSubtopics = new Map<string, string>();
  for (const config of configByChapter.values()) {
    for (const st of config.subtopics) allSubtopics.set(st.id, st.name);
  }

  const studentId = sessions[0]?.studentId;
  const primaryConfig = configByChapter.get("fractions") ?? Array.from(configByChapter.values())[0];

  const skillScores = studentId
    ? await prisma.skillScore.findMany({ where: { studentId } })
    : [];
  const eloBySubtopic = new Map(skillScores.map((s) => [s.subtopicId, s.elo]));
  const masteryData = primaryConfig
    ? primaryConfig.subtopics.map((st) => ({
        subtopicId: st.id,
        name: st.name,
        elo: eloBySubtopic.get(st.id) ?? 1000,
      }))
    : [];

  const completedSessions = sessions.filter((s) => s.status === "complete");
  const completedDatesDesc = Array.from(
    new Set(completedSessions.map((s) => localDateString(s.date)))
  ).sort((a, b) => (a < b ? 1 : -1));
  const streak = computeStreak(completedDatesDesc);

  const trendData = completedSessions
    .slice(0, 14)
    .slice()
    .reverse()
    .map((s) => ({
      sessionId: s.id,
      label: new Date(s.date).toLocaleDateString("en-SG", { month: "short", day: "numeric" }),
      accuracyPct: s.attempts.length > 0 ? Math.round(((s.score ?? 0) / s.attempts.length) * 100) : 0,
      medianSeconds: s.medianSeconds,
    }));

  // Weak-concept ranking: aggregate every attempt in the fetched window,
  // regardless of which session/filter is currently selected, so "what does
  // she lack" always reflects the full recent history, not just what's shown.
  type ConceptStat = {
    subtopicId: string;
    total: number;
    wrong: number;
    misconceptionCounts: Map<string, number>;
  };
  const statsBySubtopic = new Map<string, ConceptStat>();
  for (const s of sessions) {
    for (const a of s.attempts) {
      const id = a.problem.subtopicId;
      const stat = statsBySubtopic.get(id) ?? {
        subtopicId: id,
        total: 0,
        wrong: 0,
        misconceptionCounts: new Map<string, number>(),
      };
      stat.total += 1;
      if (!a.correct) {
        stat.wrong += 1;
        if (a.misconceptionId) {
          stat.misconceptionCounts.set(
            a.misconceptionId,
            (stat.misconceptionCounts.get(a.misconceptionId) ?? 0) + 1
          );
        }
      }
      statsBySubtopic.set(id, stat);
    }
  }
  const weakConcepts = Array.from(statsBySubtopic.values())
    .filter((s) => s.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong);

  const showWrongOnly = show === "wrong";

  let visibleSessions = sessions;
  if (sessionParam && sessionParam !== "all") {
    visibleSessions = sessions.filter((s) => s.id === sessionParam);
  } else if (!sessionParam && !subtopicParam) {
    // Default: latest session only.
    visibleSessions = sessions.slice(0, 1);
  }
  // sessionParam === "all", or any subtopic filter, leaves the full window in play.

  const hasActiveFilter = Boolean(sessionParam || subtopicParam || showWrongOnly);

  function attemptMatches(a: { correct: boolean; problem: { subtopicId: string } }): boolean {
    if (subtopicParam && a.problem.subtopicId !== subtopicParam) return false;
    if (showWrongOnly && a.correct) return false;
    return true;
  }

  const hasRowFilter = Boolean(subtopicParam) || showWrongOnly;
  const sessionsToRender = visibleSessions.filter((s) =>
    hasRowFilter ? s.attempts.some(attemptMatches) : true
  );

  return (
    <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <form action={logoutAction}>
          <button className="text-sm text-neutral-500 underline">Log out</button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-3 sm:grid-cols-4 gap-3">
        <div className="col-span-1 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-bold">
            {streak > 0 ? `🔥 ${streak}` : "—"}
          </span>
          <span className="text-xs text-neutral-500 mt-1">day streak</span>
        </div>
        {masteryData.length > 0 && (
          <div className="col-span-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <h2 className="text-sm font-semibold mb-3">Mastery by concept</h2>
            <MasteryBarChart data={masteryData} />
          </div>
        )}
      </div>

      {trendData.length > 0 && (
        <div className="mb-6 grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <h2 className="text-sm font-semibold mb-2">Accuracy trend</h2>
            <AccuracyTrendChart data={trendData} />
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <h2 className="text-sm font-semibold mb-2">Speed trend</h2>
            <SpeedTrendChart data={trendData} />
          </div>
        </div>
      )}

      {weakConcepts.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
            Concepts to work on (last {sessions.length} sessions)
          </h2>
          <div className="space-y-1">
            {weakConcepts.slice(0, 8).map((stat) => {
              const config = Array.from(configByChapter.values()).find((c) =>
                c.subtopics.some((st) => st.id === stat.subtopicId)
              );
              const topMisconception = Array.from(stat.misconceptionCounts.entries()).sort(
                (a, b) => b[1] - a[1]
              )[0];
              const topInfo = topMisconception
                ? misconceptionInfo(config, topMisconception[0])
                : null;
              const accuracyPct = Math.round(((stat.total - stat.wrong) / stat.total) * 100);
              return (
                <a
                  key={stat.subtopicId}
                  href={`/parent?subtopic=${stat.subtopicId}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-sm hover:underline decoration-amber-500"
                >
                  <span className="font-medium text-amber-900 dark:text-amber-200">
                    {subtopicName(config, stat.subtopicId)}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">
                    {stat.wrong}/{stat.total} wrong ({accuracyPct}% correct)
                  </span>
                  {topInfo && (
                    <span className="text-amber-600 dark:text-amber-500 text-xs">
                      — mostly &ldquo;{topInfo.name}&rdquo;
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 mb-6 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Session</label>
          <select
            name="session"
            defaultValue={sessionParam ?? ""}
            className="border rounded px-2 py-1 bg-transparent"
          >
            <option value="">Latest</option>
            <option value="all">All recent ({sessions.length})</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.date).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Concept</label>
          <select
            name="subtopic"
            defaultValue={subtopicParam ?? ""}
            className="border rounded px-2 py-1 bg-transparent"
          >
            <option value="">All concepts</option>
            {Array.from(allSubtopics.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">Show</label>
          <select
            name="show"
            defaultValue={show ?? ""}
            className="border rounded px-2 py-1 bg-transparent"
          >
            <option value="">All answers</option>
            <option value="wrong">Wrong only</option>
          </select>
        </div>

        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-1.5">
          Apply
        </button>
        {hasActiveFilter && (
          <a href="/parent" className="text-neutral-500 underline px-1 py-1.5">
            Reset
          </a>
        )}
      </form>

      <div className="space-y-8">
        {sessionsToRender.map((s) => {
          const problemIds = s.problemIds as string[];
          const chapterId = s.attempts[0]?.problem.chapterId;
          const config = chapterId ? configByChapter.get(chapterId) : undefined;
          const baseCount = Math.min(
            config?.session_defaults.problems_per_session ?? 10,
            problemIds.length || Infinity
          );
          const retryProblemIds = new Set(problemIds.slice(baseCount));

          const originalAttempts = s.attempts.filter((a) => !retryProblemIds.has(a.problemId));
          const originalCorrect = originalAttempts.filter((a) => a.correct).length;
          const retryCount = s.attempts.length - originalAttempts.length;

          let qNumber = 0;
          const labeledAttempts = s.attempts.map((a) => {
            const isRetry = retryProblemIds.has(a.problemId);
            if (!isRetry) qNumber += 1;
            return { attempt: a, label: isRetry ? `↳ retry of Q${qNumber}` : `Q${qNumber}` };
          });

          const rows = labeledAttempts.filter(({ attempt }) => attemptMatches(attempt));

          return (
            <div
              key={s.id}
              className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4"
            >
              <div className="flex justify-between items-baseline text-sm text-neutral-500 mb-3">
                <span>
                  {s.student.name} — {new Date(s.date).toLocaleString()}
                </span>
                <span>
                  {s.status} — {originalCorrect}/{originalAttempts.length || problemIds.length} correct
                  {retryCount > 0 ? ` · ${retryCount} retr${retryCount === 1 ? "y" : "ies"}` : ""}
                  {rows.length < s.attempts.length ? ` · showing ${rows.length} matching filter` : ""}
                </span>
              </div>

              <div className="space-y-2">
                {rows.map(({ attempt: a, label }) => {
                  if (a.correct) {
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400 pl-1"
                      >
                        <span className="w-28 shrink-0 font-mono text-xs text-neutral-400">
                          {label}
                        </span>
                        <span className="text-green-600">✓</span>
                        <span className="truncate">{a.problem.statement}</span>
                        <span className="ml-auto shrink-0 text-xs text-neutral-400">
                          {a.seconds}s
                        </span>
                      </div>
                    );
                  }

                  const options = a.problem.options as unknown as StoredOption[];
                  const chosen = options[a.chosenOptionIdx];
                  const correctOption = options.find((o) => o.is_correct);
                  const misconception = misconceptionInfo(config, a.misconceptionId);

                  return (
                    <div
                      key={a.id}
                      className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mb-1">
                        <span className="font-mono">{label}</span>
                        <span className="text-red-600">✗</span>
                        <span>
                          {subtopicName(config, a.problem.subtopicId)} · Level {a.problem.level}
                        </span>
                        <span className="ml-auto">{a.seconds}s</span>
                      </div>
                      <p className="text-neutral-800 dark:text-neutral-100 font-medium mb-1">
                        {a.problem.statement}
                      </p>
                      <p className="text-neutral-700 dark:text-neutral-300">
                        Answered:{" "}
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          {chosen?.display ?? "(no answer)"}
                        </span>{" "}
                        — Correct:{" "}
                        <span className="text-green-700 dark:text-green-400 font-medium">
                          {correctOption?.display ?? "?"}
                        </span>
                      </p>
                      {misconception && (
                        <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-xs">
                          Misconception: <span className="font-medium">{misconception.name}</span>
                          {" — "}
                          {misconception.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {sessions.length > 0 && sessionsToRender.length === 0 && (
          <p className="text-neutral-500">No attempts match the current filters.</p>
        )}
        {sessions.length === 0 && <p className="text-neutral-500">No sessions yet.</p>}
      </div>
    </main>
  );
}
