"use client";

import { useState } from "react";
import { PlayClient, PlayProblem } from "./PlayClient";
import { ConceptPrimer, PrimerSubtopic } from "./ConceptPrimer";

export function PlaySessionClient({
  sessionId,
  problems,
  initialPointsBalance,
  subtopics,
}: {
  sessionId: string;
  problems: PlayProblem[];
  initialPointsBalance: number;
  subtopics: PrimerSubtopic[];
}) {
  const [started, setStarted] = useState(false);

  if (!started) {
    return <ConceptPrimer subtopics={subtopics} onDone={() => setStarted(true)} />;
  }

  return (
    <PlayClient
      sessionId={sessionId}
      problems={problems}
      initialPointsBalance={initialPointsBalance}
    />
  );
}
