import { NextResponse } from "next/server";

export async function GET() {
  const relevantKeys = [
    "DATABASE_URL",
    "ANTHROPIC_API_KEY",
    "PARENT_PIN_HASH_B64",
    "JOB_SECRET",
    "SES_FROM_EMAIL",
    "PARENT_EMAIL",
  ];

  const present: Record<string, boolean> = {};
  for (const key of relevantKeys) {
    present[key] = Boolean(process.env[key]);
  }

  const allEnvKeys = Object.keys(process.env)
    .filter((k) => !k.startsWith("AWS_") && !k.startsWith("_"))
    .sort();

  return NextResponse.json({ present, allEnvKeys });
}
