import { readFileSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(process.cwd(), "prompts");

export interface PromptTemplate {
  system: string;
  user: string;
}

export function loadPromptTemplate(name: string): PromptTemplate {
  const raw = readFileSync(join(PROMPTS_DIR, name), "utf-8");
  const [, system, user] = raw.split(/<<<SYSTEM>>>|<<<USER>>>/);
  return { system: system.trim(), user: user.trim() };
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Missing placeholder value for {{${key}}}`);
    }
    return values[key];
  });
}
