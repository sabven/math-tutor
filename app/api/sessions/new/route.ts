import { NextResponse } from "next/server";
import { startNewSession } from "@/lib/session";
import { getFamilySession } from "@/lib/familyAuth";

export async function POST() {
  const familySession = await getFamilySession();
  if (!familySession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { session } = await startNewSession(familySession.student.id);
  return NextResponse.json({ sessionId: session.id });
}
