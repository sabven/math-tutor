"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BlockMath } from "react-katex";
import { ConfettiBurst } from "./ConfettiBurst";
import { playCorrectSound, playPerfectFanfare, playWrongSound } from "@/lib/sound";

export interface PlayOption {
  display: string;
  is_correct: boolean;
  misconception_id: string | null;
}

export interface PlayProblem {
  id: string;
  subtopicId: string;
  statement: string;
  statementLatex: string;
  options: PlayOption[];
  hint: string;
  solutionSteps: string[];
  estimatedSeconds: number;
}

interface AttemptRecord {
  correct: boolean;
  seconds: number;
}

type Phase = "unanswered" | "retry" | "correct" | "hint" | "solution" | "stale";

const CORRECT_MESSAGES = [
  "Fraction ninja! 🥷",
  "Nailed it! ✨",
  "Zooming ahead! 🚀",
  "Boom! Correct! 💥",
  "You're on fire! 🔥",
  "Smooth as pie! 🥧",
  "Math wizard alert! 🧙",
  "Too easy for you! 😎",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

type Shape = "triangle" | "diamond" | "circle" | "square";

const OPTION_THEME: { shape: Shape; solid: string; ring: string }[] = [
  { shape: "triangle", solid: "bg-red-400 dark:bg-red-500", ring: "ring-red-300" },
  { shape: "diamond", solid: "bg-blue-400 dark:bg-blue-500", ring: "ring-blue-300" },
  { shape: "circle", solid: "bg-amber-400 dark:bg-amber-500", ring: "ring-amber-300" },
  { shape: "square", solid: "bg-emerald-400 dark:bg-emerald-500", ring: "ring-emerald-300" },
];

function ShapeIcon({ shape }: { shape: Shape }) {
  const common = "h-6 w-6 fill-current shrink-0 drop-shadow";
  switch (shape) {
    case "triangle":
      return (
        <svg viewBox="0 0 24 24" className={common}>
          <polygon points="12,3 22,20 2,20" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 24 24" className={common}>
          <polygon points="12,2 22,12 12,22 2,12" />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox="0 0 24 24" className={common}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case "square":
      return (
        <svg viewBox="0 0 24 24" className={common}>
          <rect x="3" y="3" width="18" height="18" rx="4" />
        </svg>
      );
  }
}

function HomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Go home"
      className="fixed top-4 left-4 z-50 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-neutral-900/90 text-purple-700 dark:text-purple-200 px-4 py-2 text-sm font-semibold shadow-lg hover:bg-white dark:hover:bg-neutral-900 active:scale-95 transition-all"
    >
      🏠 Home
    </button>
  );
}

function ProgressTrail({
  total,
  currentIndex,
  records,
}: {
  total: number;
  currentIndex: number;
  records: AttemptRecord[];
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap">
      {Array.from({ length: total }).map((_, i) => {
        const rec = records[i];
        if (rec) {
          return (
            <span key={i} className="text-lg leading-none animate-wiggle-in">
              {rec.correct ? "⭐" : "💧"}
            </span>
          );
        }
        const isCurrent = i === currentIndex;
        return (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              isCurrent
                ? "bg-fuchsia-400 animate-pulse scale-125"
                : "bg-white/60 dark:bg-white/20"
            }`}
          />
        );
      })}
    </div>
  );
}

export function PlayClient({
  sessionId,
  problems,
  initialPointsBalance,
}: {
  sessionId: string;
  problems: PlayProblem[];
  initialPointsBalance: number;
}) {
  const [problemList, setProblemList] = useState(problems);
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [barFilled, setBarFilled] = useState(false);
  const [records, setRecords] = useState<AttemptRecord[]>([]);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState<Phase>("unanswered");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [liveHint, setLiveHint] = useState<string | null>(null);
  const [solutionSteps, setSolutionSteps] = useState<string[]>([]);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [shake, setShake] = useState(false);
  const [levelBanner, setLevelBanner] = useState<string | null>(null);
  const [startingNewSession, setStartingNewSession] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [leavingHome, setLeavingHome] = useState(false);
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);
  const [pointsBalance, setPointsBalance] = useState<number>(initialPointsBalance);
  const [lastPointsEarned, setLastPointsEarned] = useState<number | null>(null);
  const [wrongAttemptIdx, setWrongAttemptIdx] = useState<number | null>(null);
  const [retryUsed, setRetryUsed] = useState(false);

  const problem = problemList[index];

  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].correct) streak++;
    else break;
  }

  useEffect(() => {
    setStartedAt(Date.now());
    setChosenIdx(null);
    setCorrectIdx(null);
    setBarFilled(false);
    setPhase("unanswered");
    setFeedbackMessage(null);
    setLiveHint(null);
    setSolutionSteps([]);
    setShake(false);
    setLastPointsEarned(null);
    setWrongAttemptIdx(null);
    setRetryUsed(false);
    const t = setTimeout(() => setBarFilled(true), 50);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (!levelBanner) return;
    const t = setTimeout(() => setLevelBanner(null), 3500);
    return () => clearTimeout(t);
  }, [levelBanner]);

  function goHome() {
    window.location.href = "/";
  }

  async function stopSessionAndGoHome() {
    setLeavingHome(true);
    const correctCount = records.filter((r) => r.correct).length;
    const times = [...records.map((r) => r.seconds)].sort((a, b) => a - b);
    const medianSeconds = times.length ? times[Math.floor(times.length / 2)] : 0;
    const perfect = correctCount === problemList.length;

    await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: correctCount, medianSeconds, perfect }),
    });
    goHome();
  }

  function handleHomeClick() {
    if (records.length < problemList.length) {
      setShowHomeConfirm(true);
    } else {
      stopSessionAndGoHome();
    }
  }

  if (!problemList.length) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
        <HomeButton onClick={goHome} />
        <p className="text-lg text-neutral-500 dark:text-neutral-400">
          No problems available yet. Ask a parent to generate today&apos;s session.
        </p>
      </main>
    );
  }

  async function choose(optionIdx: number) {
    if (chosenIdx !== null || optionIdx === wrongAttemptIdx) return;

    // First wrong pick gets one free retry instead of finalizing as wrong:
    // let them pick again, just gray out the option they already tried.
    if (!retryUsed && !problem.options[optionIdx]?.is_correct) {
      setWrongAttemptIdx(optionIdx);
      setRetryUsed(true);
      setPhase("retry");
      playWrongSound();
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setChosenIdx(optionIdx);

    const res = await fetch(`/api/sessions/${sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemId: problem.id,
        chosenOptionIdx: optionIdx,
        seconds,
        usedRetry: retryUsed,
      }),
    });

    if (res.status === 410) {
      setPhase("stale");
      return;
    }

    const data = await res.json();
    setCorrectIdx(data.correctIdx);
    setRecords((prev) => [...prev, { correct: data.correct, seconds }]);

    if (data.levelChange === "up") {
      setLevelBanner(`🎉 Level up! Now at Level ${data.newLevel}`);
    } else if (data.levelChange === "down") {
      setLevelBanner(`💪 Dialing it back to Level ${data.newLevel} for more practice`);
    }

    if (data.correct) {
      playCorrectSound();
      setPhase("correct");
      setFeedbackMessage(pickRandom(CORRECT_MESSAGES));
      setConfettiTrigger((t) => t + 1);
      if (typeof data.pointsEarned === "number") {
        setLastPointsEarned(data.pointsEarned);
        setPointsBalance(data.pointsBalance);
      }
    } else {
      playWrongSound();
      setShake(true);
      setPhase("hint");
      setLiveHint(data.hint ?? problem.hint);
      setSolutionSteps(data.solutionSteps ?? []);
      if (data.retryProblem) {
        const retry: PlayProblem = data.retryProblem;
        setProblemList((prev) => {
          const next = [...prev];
          next.splice(index + 1, 0, retry);
          return next;
        });
      }
    }
  }

  function showSolution() {
    setPhase("solution");
  }

  async function next() {
    if (index + 1 < problemList.length) {
      setIndex(index + 1);
      return;
    }

    const correctCount = records.filter((r) => r.correct).length;
    const times = [...records.map((r) => r.seconds)].sort((a, b) => a - b);
    const medianSeconds = times.length ? times[Math.floor(times.length / 2)] : 0;
    const perfect = correctCount === problemList.length;

    const res = await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: correctCount, medianSeconds, perfect }),
    });
    const data = await res.json();
    setPointsAwarded(data.pointsAwarded ?? null);
    setPointsBalance(data.pointsBalance ?? null);

    if (perfect) {
      playPerfectFanfare();
      setConfettiTrigger((t) => t + 1);
    }
    setDone(true);
  }

  async function playAgain() {
    setStartingNewSession(true);
    await fetch("/api/sessions/new", { method: "POST" });
    window.location.reload();
  }

  if (done) {
    const correctCount = records.filter((r) => r.correct).length;
    const perfect = correctCount === problemList.length;
    const stars = correctCount === problemList.length ? 3 : correctCount >= problemList.length * 0.7 ? 2 : 1;
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
        <HomeButton onClick={goHome} />
        <ConfettiBurst trigger={confettiTrigger} count={perfect ? 60 : 24} />
        <div className="text-6xl animate-wiggle-in">
          {"⭐".repeat(stars)}
          {"☆".repeat(3 - stars)}
        </div>
        <h1 className="font-fun text-4xl font-bold animate-pop-in text-purple-700 dark:text-purple-200">
          {perfect ? "Perfect score!" : "Great job today!"}
        </h1>
        <p className="text-xl text-neutral-700 dark:text-neutral-200">
          {correctCount} / {problemList.length} correct
        </p>
        {pointsAwarded !== null && pointsAwarded > 0 && (
          <p className="font-fun text-lg font-semibold text-amber-500 animate-pop-in">
            +{pointsAwarded} points! ✨ ({pointsBalance} total)
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={playAgain}
            disabled={startingNewSession}
            className="font-fun mt-2 px-8 py-3 rounded-full bg-purple-600 text-white font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-60"
          >
            {startingNewSession ? "Getting new questions…" : "Play again 🔁"}
          </button>
          <Link
            href="/play/shop"
            className="font-fun mt-2 px-8 py-3 rounded-full bg-amber-500 text-white font-semibold text-lg shadow-lg hover:bg-amber-600 active:scale-95 transition-all flex items-center"
          >
            Shop 🎁
          </Link>
        </div>
      </main>
    );
  }

  const progressWidthPct = barFilled ? 100 : 0;
  const progressDurationS = Math.max(problem.estimatedSeconds, 10);
  const revealCorrect = phase === "correct" || phase === "solution";

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-2xl mx-auto w-full bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
      <HomeButton onClick={handleHomeClick} />
      <ConfettiBurst trigger={confettiTrigger} />

      {showHomeConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 shadow-xl p-6 text-center">
            <p className="font-fun text-lg font-semibold text-purple-700 dark:text-purple-200 mb-2">
              Wait, you&apos;re not done yet!
            </p>
            <p className="text-neutral-700 dark:text-neutral-200 mb-5">
              You&apos;ve answered {records.length} of {problemList.length} questions. Are you sure you
              want to go home?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowHomeConfirm(false)}
                className="font-fun px-6 py-2.5 rounded-full bg-purple-600 text-white font-semibold hover:bg-purple-700 active:scale-95 transition-all"
              >
                Keep playing
              </button>
              <button
                onClick={stopSessionAndGoHome}
                disabled={leavingHome}
                className="px-6 py-2.5 rounded-full text-neutral-500 dark:text-neutral-400 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60 transition-all"
              >
                {leavingHome ? "Leaving…" : "Yes, go home"}
              </button>
            </div>
          </div>
        </div>
      )}

      {levelBanner && (
        <div className="font-fun fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-purple-600 text-white px-5 py-2 text-sm font-semibold shadow-lg animate-pop-in">
          {levelBanner}
        </div>
      )}

      <div className="flex w-full items-center justify-between">
        <h1 className="font-fun text-2xl font-semibold text-purple-700 dark:text-purple-200">
          🍕 Fraction Quest
        </h1>
        <div className="flex items-center gap-3">
          <span className="font-fun flex items-center gap-1 text-lg font-semibold text-amber-500">
            ✨ {pointsBalance}
          </span>
          {streak >= 2 && (
            <span className="font-fun flex items-center gap-1 text-lg font-semibold text-orange-500 animate-wiggle-in">
              🔥 {streak}
            </span>
          )}
        </div>
      </div>

      <ProgressTrail total={problemList.length} currentIndex={index} records={records} />

      <div className="w-full h-3 bg-white/50 dark:bg-white/10 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 via-fuchsia-400 to-amber-400"
          style={{
            width: `${progressWidthPct}%`,
            transition: chosenIdx === null
              ? `width ${progressDurationS}s linear`
              : "none",
          }}
        />
      </div>

      <div className="w-full rounded-3xl bg-white dark:bg-neutral-900 shadow-lg shadow-purple-200/50 dark:shadow-black/40 px-6 py-8 text-lg sm:text-2xl text-center break-words">
        <BlockMath math={problem.statementLatex} />
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        {problem.options.map((opt, i) => {
          const theme = OPTION_THEME[i % OPTION_THEME.length];
          let colorClasses = `${theme.solid} text-white active:scale-95 hover:brightness-105`;
          let extra = "";
          if (chosenIdx !== null) {
            if (revealCorrect && i === correctIdx) {
              extra = "animate-pop-in ring-4 ring-offset-2 dark:ring-offset-neutral-900 " + theme.ring;
            } else if (i === chosenIdx) {
              colorClasses = "bg-neutral-400 dark:bg-neutral-600 text-white";
              extra = shake ? "animate-shake" : "";
            } else {
              colorClasses = `${theme.solid} text-white opacity-30`;
            }
          } else if (i === wrongAttemptIdx) {
            colorClasses = "bg-neutral-400 dark:bg-neutral-600 text-white opacity-70";
            extra = shake ? "animate-shake" : "";
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={chosenIdx !== null || i === wrongAttemptIdx}
              className={`flex items-center justify-center gap-2 text-xl font-bold rounded-2xl py-8 px-4 shadow-md transition-all ${colorClasses} ${extra}`}
            >
              <ShapeIcon shape={theme.shape} />
              {opt.display}
            </button>
          );
        })}
      </div>

      {phase === "stale" && (
        <div className="w-full rounded-2xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-300 dark:border-sky-700 px-5 py-4 animate-pop-in text-center">
          <p className="font-fun text-sky-700 dark:text-sky-300 font-semibold mb-2">
            This session already finished! 🎉
          </p>
          <p className="text-neutral-700 dark:text-neutral-200 mb-3">
            Looks like this page has been open a while. Let&apos;s get you a fresh set of problems.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="font-fun px-8 py-3 rounded-full bg-sky-600 text-white font-semibold text-lg shadow-lg hover:bg-sky-700 active:scale-95 transition-all"
          >
            Refresh
          </button>
        </div>
      )}

      {phase === "retry" && (
        <p className="font-fun text-lg font-semibold animate-pop-in text-rose-500">
          Not quite — give it one more try! 🔄
        </p>
      )}

      {phase === "correct" && feedbackMessage && (
        <p className="font-fun text-lg font-semibold animate-pop-in text-emerald-600 dark:text-emerald-400">
          {feedbackMessage}
          {lastPointsEarned !== null && (
            <span className="text-amber-500 ml-2">+{lastPointsEarned} ✨</span>
          )}
        </p>
      )}

      {phase === "hint" && (
        <div className="w-full rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 px-5 py-4 animate-pop-in">
          <p className="font-fun text-rose-500 font-semibold mb-1">Not quite!</p>
          <p className="text-neutral-700 dark:text-neutral-200">💡 {liveHint}</p>
        </div>
      )}

      {phase === "solution" && (
        <div className="w-full rounded-2xl bg-sky-50 dark:bg-sky-950/40 border-2 border-sky-300 dark:border-sky-700 px-5 py-4 animate-pop-in text-left">
          <p className="font-fun text-sky-700 dark:text-sky-300 font-semibold mb-2">Here's how:</p>
          <ol className="list-decimal list-inside space-y-1 text-neutral-700 dark:text-neutral-200">
            {solutionSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {phase === "hint" && (
        <button
          onClick={showSolution}
          className="font-fun px-8 py-3 rounded-full bg-sky-600 text-white font-semibold text-lg shadow-lg hover:bg-sky-700 active:scale-95 transition-all"
        >
          Show me the answer
        </button>
      )}

      {(phase === "correct" || phase === "solution") && (
        <button
          onClick={next}
          className="font-fun mt-1 px-8 py-3 rounded-full bg-purple-600 text-white font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
        >
          {index + 1 < problemList.length ? "Next →" : "Finish 🎉"}
        </button>
      )}
    </main>
  );
}
