import { NextResponse } from "next/server";
import { startNewSession } from "@/lib/session";

export async function POST() {
  const { session } = await startNewSession();
  return NextResponse.json({ sessionId: session.id });
}
