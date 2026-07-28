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

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
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
      <main className="flex-1 flex items-center justify-center p-8">
        <p className="text-lg text-neutral-500">
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
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <ConfettiBurst trigger={confettiTrigger} count={perfect ? 60 : 24} />
        <h1 className="text-3xl font-bold animate-pop-in">
          {perfect ? "Perfect score! 🎉🏆" : "Session complete! 🎈"}
        </h1>
        <p className="text-xl">
          {correctCount} / {problems.length} correct
        </p>
      </main>
    );
  }

  const progressWidthPct = barFilled ? 100 : 0;
  const progressDurationS = Math.max(problem.estimatedSeconds, 10);

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 p-6 max-w-2xl mx-auto w-full">
      <ConfettiBurst trigger={confettiTrigger} />

      <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full"
          style={{
            width: `${progressWidthPct}%`,
            transition: chosenIdx === null
              ? `width ${progressDurationS}s linear`
              : "none",
          }}
        />
      </div>

      <div className="text-sm text-neutral-500">
        Problem {index + 1} of {problems.length}
      </div>

      <div className="text-2xl text-center">
        <BlockMath math={problem.statementLatex} />
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
        {problem.options.map((opt, i) => {
          let style = "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700";
          let extra = "";
          if (chosenIdx !== null) {
            if (i === correctIdx) {
              style = "bg-green-500 text-white";
              extra = "animate-pop-in";
            } else if (i === chosenIdx) {
              style = "bg-red-500 text-white";
              extra = shake ? "animate-shake" : "";
            } else {
              style = "bg-neutral-100 dark:bg-neutral-800 opacity-50";
            }
          }
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={chosenIdx !== null}
              className={`text-xl font-medium rounded-xl py-8 px-4 transition-colors ${style} ${extra}`}
            >
              {opt.display}
            </button>
          );
        })}
      </div>

      {feedbackMessage && (
        <p
          className={`text-lg font-semibold animate-pop-in ${
            records[records.length - 1]?.correct ? "text-green-600 dark:text-green-400" : "text-red-500"
          }`}
        >
          {feedbackMessage}
        </p>
      )}

      {chosenIdx !== null && (
        <button
          onClick={next}
          className="mt-2 px-6 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700"
        >
          {index + 1 < problems.length ? "Next" : "Finish"}
        </button>
      )}
    </main>
  );
}
