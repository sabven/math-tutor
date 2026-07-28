import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();

// Sonnet 4.6 is used deliberately (per docs/build-plan.md): generation relies on
// temperature 0.7 for numeric/context variety and 0.3 for hints/reports, and
// non-default sampling parameters are rejected on Sonnet 5 / Opus 5.
export const GENERATION_MODEL = "claude-sonnet-4-6";
