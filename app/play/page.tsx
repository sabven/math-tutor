import { getOrCreateTodaySession } from "@/lib/session";
import { PlayClient, PlayProblem } from "./PlayClient";

export default async function PlayPage() {
  const { session, problems } = await getOrCreateTodaySession();

  const clientProblems: PlayProblem[] = problems.map((p) => ({
    id: p.id,
    statement: p.statement,
    statementLatex: p.statementLatex,
    options: p.options as unknown as PlayProblem["options"],
    hint: p.hint,
    solutionSteps: p.solutionSteps as unknown as string[],
    estimatedSeconds: p.estimatedSeconds,
  }));

  return <PlayClient sessionId={session.id} problems={clientProblems} />;
}
