import { evaluate } from "mathjs";

export type Answer =
  | { type: "fraction"; numerator: number; denominator: number }
  | { type: "mixed"; whole: number; numerator: number; denominator: number }
  | { type: "integer"; value: number }
  | { type: "expression"; value: string };

export interface VerifySubstitution {
  equation: string;
  solution: string;
}

const EPSILON = 1e-9;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function answerToNumber(answer: Answer): number | null {
  switch (answer.type) {
    case "fraction":
      return answer.numerator / answer.denominator;
    case "mixed": {
      const sign = answer.whole < 0 ? -1 : 1;
      return answer.whole + sign * (answer.numerator / answer.denominator);
    }
    case "integer":
      return answer.value;
    case "expression":
      try {
        return Number(evaluate(answer.value));
      } catch {
        return null;
      }
  }
}

export function isSimplified(answer: Answer): boolean {
  if (answer.type === "fraction") {
    return gcd(answer.numerator, answer.denominator) === 1;
  }
  if (answer.type === "mixed") {
    return gcd(answer.numerator, answer.denominator) === 1;
  }
  return true;
}

export function verifyExpressionMatchesAnswer(
  verifyExpression: string,
  answer: Answer
): boolean {
  const expected = answerToNumber(answer);
  if (expected === null) return false;
  let actual: number;
  try {
    actual = Number(evaluate(verifyExpression));
  } catch {
    return false;
  }
  if (!Number.isFinite(actual)) return false;
  return Math.abs(actual - expected) < EPSILON;
}

export function verifySubstitutionMatches(sub: VerifySubstitution): boolean {
  const parts = sub.equation.split("==");
  if (parts.length !== 2) return false;
  const [lhsRaw, rhsRaw] = parts;
  const substitute = (expr: string) =>
    expr.replace(/\bx\b/g, `(${sub.solution})`);
  try {
    const lhs = Number(evaluate(substitute(lhsRaw)));
    const rhs = Number(evaluate(substitute(rhsRaw)));
    if (!Number.isFinite(lhs) || !Number.isFinite(rhs)) return false;
    return Math.abs(lhs - rhs) < EPSILON;
  } catch {
    return false;
  }
}
