import { describe, it, expect } from "vitest";
import { parseModerationVerdict } from "@/lib/moderation";

describe("parseModerationVerdict", () => {
  it("parses a clean pass", () => {
    expect(parseModerationVerdict('{ "pass": true }')).toEqual({ pass: true, reasons: [] });
  });

  it("parses a clean fail with reasons", () => {
    expect(parseModerationVerdict('{ "pass": false, "reasons": ["too scary"] }')).toEqual({
      pass: false,
      reasons: ["too scary"],
    });
  });

  it("strips ```json fences the model adds despite instructions", () => {
    const raw = '```json\n{ "pass": true }\n```';
    expect(parseModerationVerdict(raw)).toEqual({ pass: true, reasons: [] });
  });

  it("strips plain ``` fences", () => {
    const raw = '```\n{ "pass": false, "reasons": ["x"] }\n```';
    expect(parseModerationVerdict(raw)).toEqual({ pass: false, reasons: ["x"] });
  });

  it("fails closed on unparseable text", () => {
    const result = parseModerationVerdict("I'm not sure how to answer that.");
    expect(result.pass).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("fails closed when pass is missing", () => {
    const result = parseModerationVerdict('{ "reasons": ["x"] }');
    expect(result.pass).toBe(false);
  });

  it("fails a false verdict with no reasons given by supplying a default reason", () => {
    const result = parseModerationVerdict('{ "pass": false }');
    expect(result.pass).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
