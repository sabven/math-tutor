"use client";

import { useEffect, useState } from "react";
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

const WRONG_MESSAGES = [
  "Sneaky one! 🤔",
  "So close, try again next time! 😅",
  "That one had a trap! 🪤",
  "Oops! The fraction gremlin got you. 👻",
  "Not quite — check the hint below!",
  "Tricky! Here's the answer.",
];

type Shape = "triangle" | "diamond" | "circle" | "square";

const OPTION_THEME: { shape: Shape; solid: string; ring: string }[] = [
  { shape: "triangle", solid: "bg-red-400 dark:bg-red-500", ring: "ring-red-300" },
  { shape: "diamond", solid: "bg-blue-400 dark:bg-blue-500", ring: "ring-blue-300" },
  { shape: "circle", solid: "bg-amber-400 dark:bg-amber-500", ring: "ring-amber-300" },
  { shape: "square", solid: "bg-emerald-400 dark:bg-emerald-500", ring: "ring-emerald-300" },
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

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
    <div className="flex items-center justify-center gap-1.5">
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
}: {
  sessionId: string;
  problems: PlayProblem[];
}) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [correctIdx, setCorrectIdx] = useState<number | null>(null);
  const [barFilled, setBarFilled] = useState(false);
  const [records, setRecords] = useState<AttemptRecord[]>([]);
  const [done, setDone] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [shake, setShake] = useState(false);

  const problem = problems[index];

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
    setFeedbackMessage(null);
    setShake(false);
    const t = setTimeout(() => setBarFilled(true), 50);
    return () => clearTimeout(t);
  }, [index]);

  if (!problems.length) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
        <p className="text-lg text-neutral-500 dark:text-neutral-400">
          No problems available yet. Ask a parent to generate today&apos;s session.
        </p>
      </main>
    );
  }

  async function choose(optionIdx: number) {
    if (chosenIdx !== null) return;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    setChosenIdx(optionIdx);

    const res = await fetch(`/api/sessions/${sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: problem.id, chosenOptionIdx: optionIdx, seconds }),
    });
    const data = await res.json();
    setCorrectIdx(data.correctIdx);
    setRecords((prev) => [...prev, { correct: data.correct, seconds }]);

    if (data.correct) {
      playCorrectSound();
      setFeedbackMessage(pickRandom(CORRECT_MESSAGES));
      setConfettiTrigger((t) => t + 1);
    } else {
      playWrongSound();
      setFeedbackMessage(pickRandom(WRONG_MESSAGES));
      setShake(true);
    }
  }

  async function next() {
    if (index + 1 < problems.length) {
      setIndex(index + 1);
      return;
    }

    const correctCount = records.filter((r) => r.correct).length;
    const times = [...records.map((r) => r.seconds)].sort((a, b) => a - b);
    const medianSeconds = times.length ? times[Math.floor(times.length / 2)] : 0;
    const perfect = correctCount === problems.length;

    await fetch(`/api/sessions/${sessionId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: correctCount, medianSeconds, perfect }),
    });

    if (perfect) {
      playPerfectFanfare();
      setConfettiTrigger((t) => t + 1);
    }
    setDone(true);
  }

  if (done) {
    const correctCount = records.filter((r) => r.correct).length;
    const perfect = correctCount === problems.length;
    const stars = correctCount === problems.length ? 3 : correctCount >= problems.length * 0.7 ? 2 : 1;
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
        <ConfettiBurst trigger={confettiTrigger} count={perfect ? 60 : 24} />
        <div className="text-6xl animate-wiggle-in">
          {"⭐".repeat(stars)}
          {"☆".repeat(3 - stars)}
        </div>
        <h1 className="font-fun text-4xl font-bold animate-pop-in text-purple-700 dark:text-purple-200">
          {perfect ? "Perfect score!" : "Great job today!"}
        </h1>
        <p className="text-xl text-neutral-700 dark:text-neutral-200">
          {correctCount} / {problems.length} correct
        </p>
      </main>
    );
  }

  const progressWidthPct = barFilled ? 100 : 0;
  const progressDurationS = Math.max(problem.estimatedSeconds, 10);

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-2xl mx-auto w-full bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
      <ConfettiBurst trigger={confettiTrigger} />

      <div className="flex w-full items-center justify-between">
        <h1 className="font-fun text-2xl font-semibold text-purple-700 dark:text-purple-200">
          🍕 Fraction Quest
        </h1>
        {streak >= 2 && (
          <span className="font-fun flex items-center gap-1 text-lg font-semibold text-orange-500 animate-wiggle-in">
            🔥 {streak}
          </span>
        )}
      </div>

      <ProgressTrail total={problems.length} currentIndex={index} records={records} />

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

      <div className="w-full rounded-3xl bg-white dark:bg-neutral-900 shadow-lg shadow-purple-200/50 dark:shadow-black/40 px-6 py-8 text-2xl text-center">
        <BlockMath math={problem.statementLatex} />
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        {problem.options.map((opt, i) => {
          const theme = OPTION_THEME[i % OPTION_THEME.length];
          let colorClasses = `${theme.solid} text-white active:scale-95 hover:brightness-105`;
          let extra = "";
          if (chosenIdx !== null) {
            if (i === correctIdx) {
              extra = "animate-pop-in ring-4 ring-offset-2 dark:ring-offset-neutral-900 " + theme.ring;
            } else if (i === chosenIdx) {
              colorClasses = "bg-neutral-400 dark:bg-neutral-600 text-white";
              extra = shake ? "animate-shake" : "";
            } else {
              colorClasses = `${theme.solid} text-white opacity-30`;
            }
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={chosenIdx !== null}
              className={`flex items-center justify-center gap-2 text-xl font-bold rounded-2xl py-8 px-4 shadow-md transition-all ${colorClasses} ${extra}`}
            >
              <ShapeIcon shape={theme.shape} />
              {opt.display}
            </button>
          );
        })}
      </div>

      {feedbackMessage && (
        <p
          className={`font-fun text-lg font-semibold animate-pop-in ${
            records[records.length - 1]?.correct ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
          }`}
        >
          {feedbackMessage}
        </p>
      )}

      {chosenIdx !== null && (
        <button
          onClick={next}
          className="font-fun mt-1 px-8 py-3 rounded-full bg-purple-600 text-white font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
        >
          {index + 1 < problems.length ? "Next →" : "Finish 🎉"}
        </button>
      )}
    </main>
  );
}
