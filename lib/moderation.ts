import { anthropic, MODERATION_MODEL } from "./anthropic";
import { fillTemplate, loadPromptTemplate } from "./prompts";
import type { GatePayload, GateVerdict } from "./contentGate";

function buildModerationContent(payload: GatePayload): unknown {
  if (payload.kind === "hint") {
    return { hint: payload.hintText };
  }
  return {
    statement: payload.problem.statement,
    options: payload.problem.options.map((o) => o.display),
    hint: payload.problem.hint,
    solution_steps: payload.problem.solution_steps,
  };
}

/**
 * Pure JSON parser for the moderation model's response - exported separately
 * from the API call so it's unit-testable with fixture strings, no network
 * or API key needed. Fails closed: anything that isn't a clean
 * `{ pass: boolean, reasons?: string[] }` object is treated as a fail.
 */
export function parseModerationVerdict(rawText: string): GateVerdict {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { pass: false, reasons: ["moderation response was not valid JSON"] };
  }

  if (typeof parsed !== "object" || parsed === null || typeof (parsed as { pass?: unknown }).pass !== "boolean") {
    return { pass: false, reasons: ["moderation response missing boolean 'pass' field"] };
  }

  const pass = (parsed as { pass: boolean }).pass;
  const rawReasons = (parsed as { reasons?: unknown }).reasons;
  const reasons = Array.isArray(rawReasons) ? rawReasons.map(String) : [];

  if (pass) return { pass: true, reasons: [] };
  return { pass: false, reasons: reasons.length > 0 ? reasons : ["moderation failed with no reasons given"] };
}

/** The actual Haiku safety/appropriateness call (docs/content-gate.md §4). */
export async function moderateContent(payload: GatePayload): Promise<GateVerdict> {
  const template = loadPromptTemplate("moderation.md");
  const user = fillTemplate(template.user, {
    kind: payload.kind,
    content_json: JSON.stringify(buildModerationContent(payload)),
  });

  const response = await anthropic.messages.create({
    model: MODERATION_MODEL,
    max_tokens: 500,
    temperature: 0,
    system: template.system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { pass: false, reasons: ["moderation response had no text content"] };
  }
  return parseModerationVerdict(textBlock.text);
}
