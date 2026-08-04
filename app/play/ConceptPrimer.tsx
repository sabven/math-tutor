"use client";

import { useState } from "react";
import Link from "next/link";
import type { SubtopicLesson } from "@/lib/generation";
import { ConceptDiagram } from "./ConceptDiagram";

export interface PrimerSubtopic {
  id: string;
  name: string;
  lesson?: SubtopicLesson;
}

function HomeButton() {
  return (
    <Link
      href="/"
      className="fixed top-4 left-4 z-50 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-neutral-900/90 text-purple-700 dark:text-purple-200 px-4 py-2 text-sm font-semibold shadow-lg hover:bg-white dark:hover:bg-neutral-900 active:scale-95 transition-all"
    >
      🏠 Home
    </Link>
  );
}

export function ConceptPrimer({
  subtopics,
  onDone,
}: {
  subtopics: PrimerSubtopic[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"choice" | "carousel">("choice");
  const [index, setIndex] = useState(0);

  if (mode === "choice") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-2xl mx-auto w-full bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
        <HomeButton />
        <h1 className="font-fun text-2xl font-semibold text-purple-700 dark:text-purple-200 text-center">
          🍕 Today&apos;s Concepts
        </h1>
        <div className="w-full rounded-3xl bg-white dark:bg-neutral-900 shadow-lg shadow-purple-200/50 dark:shadow-black/40 px-6 py-6 flex flex-col gap-3">
          {subtopics.map((st) => (
            <div key={st.id}>
              <p className="font-fun font-semibold text-neutral-800 dark:text-neutral-100">
                {st.name}
              </p>
              {st.lesson?.summary && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {st.lesson.summary}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => setMode("carousel")}
            className="font-fun px-8 py-3 rounded-full bg-purple-600 text-white font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
          >
            Learn these first 📚
          </button>
          <button
            onClick={onDone}
            className="font-fun px-8 py-3 rounded-full bg-sky-600 text-white font-semibold text-lg shadow-lg hover:bg-sky-700 active:scale-95 transition-all"
          >
            Skip to questions 🚀
          </button>
        </div>
      </main>
    );
  }

  const current = subtopics[index];
  const isLast = index === subtopics.length - 1;

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-6 max-w-2xl mx-auto w-full bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
      <HomeButton />

      <div className="flex items-center justify-center gap-1.5">
        {subtopics.map((st, i) => (
          <span
            key={st.id}
            className={`h-2.5 w-2.5 rounded-full ${
              i === index
                ? "bg-fuchsia-400 animate-pulse scale-125"
                : i < index
                  ? "bg-purple-400"
                  : "bg-white/60 dark:bg-white/20"
            }`}
          />
        ))}
      </div>

      <div className="w-full rounded-3xl bg-white dark:bg-neutral-900 shadow-lg shadow-purple-200/50 dark:shadow-black/40 px-6 py-8 flex flex-col items-center gap-5 text-center animate-pop-in">
        <h2 className="font-fun text-xl font-semibold text-purple-700 dark:text-purple-200">
          {current.name}
        </h2>

        {current.lesson?.summary && (
          <p className="text-neutral-700 dark:text-neutral-200">{current.lesson.summary}</p>
        )}

        {current.lesson?.diagram && <ConceptDiagram diagram={current.lesson.diagram} />}

        {current.lesson?.example_text && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
            {current.lesson.example_text}
          </p>
        )}

        {!current.lesson && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No lesson written for this concept yet.
          </p>
        )}
      </div>

      <button
        onClick={() => (isLast ? onDone() : setIndex((i) => i + 1))}
        className="font-fun px-8 py-3 rounded-full bg-purple-600 text-white font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
      >
        {isLast ? "Start questions →" : "Next →"}
      </button>
    </main>
  );
}
