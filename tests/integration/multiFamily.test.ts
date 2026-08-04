import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { sign } from "@/lib/familyAuth";

// Resolved and spawned directly via `node <script>` rather than `npx next
// start` - on Windows, npx is a .cmd shim that needs shell: true, and
// killing that shell process leaves the real Next server it launched as an
// orphan. Spawning the actual JS entry point avoids the shell entirely, so
// server.kill() in afterAll reliably tears down the real process.
const NEXT_BIN = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const prefix = `it-multifamily-${Date.now()}`;

let server: ChildProcess;

function familyCookie(familyId: string): string {
  return `family_session=${familyId}.${sign(familyId)}`;
}

function adminCookie(): string {
  if (!process.env.ADMIN_PASSWORD_HASH_B64) {
    throw new Error("ADMIN_PASSWORD_HASH_B64 must be set (see .env.example)");
  }
  const hash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64, "base64").toString("utf-8");
  return `admin_auth=${hash}`;
}

async function fetchManual(path: string, opts: RequestInit & { cookie?: string } = {}) {
  const { cookie, headers, ...rest } = opts;
  return fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    ...rest,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers },
  });
}

async function waitForServer(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server never became ready on ${BASE_URL}: ${String(lastError)}`);
}

// Fixtures seeded directly via Prisma against the test branch - two
// families, each with their own student and their own active session, plus
// a perk, mirroring the manual two-family isolation check done by hand.
let familyA: { id: string; studentId: string; sessionId: string };
let familyB: { id: string; studentId: string; sessionId: string };
let perkId: string;
let seededProblemId: string;
let seededCorrectOptionIdx: number;

beforeAll(async () => {
  execSync("npx next build", {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  server.stderr?.on("data", (chunk) => process.stderr.write(`[next start] ${chunk}`));

  await waitForServer(30_000);

  const problem = await prisma.problem.findFirstOrThrow();
  seededProblemId = problem.id;
  // Always answer correctly in tests so the attempts route takes the
  // "correct" branch (points award) rather than the "wrong" branch, which
  // calls the Anthropic API to generate a hint - not something this suite
  // should depend on network access or spend money on.
  const options = problem.options as unknown as { is_correct: boolean }[];
  seededCorrectOptionIdx = options.findIndex((o) => o.is_correct);

  const famA = await prisma.family.create({
    data: { name: `${prefix}-A`, username: `${prefix}-a`, passwordHash: "unused-in-these-tests" },
  });
  const studentA = await prisma.student.create({
    data: { name: `${prefix}-KidA`, familyId: famA.id },
  });
  const sessionA = await prisma.session.create({
    data: { studentId: studentA.id, status: "active", problemIds: [problem.id] },
  });

  const famB = await prisma.family.create({
    data: { name: `${prefix}-B`, username: `${prefix}-b`, passwordHash: "unused-in-these-tests" },
  });
  const studentB = await prisma.student.create({
    data: { name: `${prefix}-KidB`, familyId: famB.id },
  });
  const sessionB = await prisma.session.create({
    data: { studentId: studentB.id, status: "active", problemIds: [problem.id] },
  });

  familyA = { id: famA.id, studentId: studentA.id, sessionId: sessionA.id };
  familyB = { id: famB.id, studentId: studentB.id, sessionId: sessionB.id };

  const perk = await prisma.perk.create({
    data: { name: `${prefix}-perk`, pointCost: 1, active: true },
  });
  perkId = perk.id;
  await prisma.pointsLedger.create({
    data: { studentId: studentA.id, delta: 100, reason: "test-seed" },
  });
}, 180_000);

afterAll(async () => {
  server?.kill();
  if (!familyA || !familyB) return; // beforeAll failed before seeding - nothing to clean up

  await prisma.pointsLedger.deleteMany({
    where: { studentId: { in: [familyA.studentId, familyB.studentId] } },
  });
  if (perkId) {
    await prisma.redemption.deleteMany({ where: { perkId } });
    await prisma.perk.deleteMany({ where: { id: perkId } });
  }
  await prisma.attempt.deleteMany({
    where: { sessionId: { in: [familyA.sessionId, familyB.sessionId] } },
  });
  await prisma.session.deleteMany({
    where: { id: { in: [familyA.sessionId, familyB.sessionId] } },
  });
  await prisma.skillScore.deleteMany({
    where: { studentId: { in: [familyA.studentId, familyB.studentId] } },
  });
  await prisma.student.deleteMany({
    where: { id: { in: [familyA.studentId, familyB.studentId] } },
  });
  await prisma.family.deleteMany({ where: { id: { in: [familyA.id, familyB.id] } } });
}, 30_000);

describe("unauthenticated access", () => {
  it("redirects /play to /login", async () => {
    const res = await fetchManual("/play");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects /parent to /login", async () => {
    const res = await fetchManual("/parent");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects /admin to /admin/login", async () => {
    const res = await fetchManual("/admin");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("rejects POST /api/sessions/new with 401", async () => {
    const res = await fetchManual("/api/sessions/new", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("admin gate is independent of family login", () => {
  it("a valid family session cannot reach /admin", async () => {
    const res = await fetchManual("/admin", { cookie: familyCookie(familyA.id) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("a valid admin session can reach /admin", async () => {
    const res = await fetchManual("/admin", { cookie: adminCookie() });
    expect(res.status).toBe(200);
  });

  it("the admin cookie alone does not unlock /parent", async () => {
    const res = await fetchManual("/parent", { cookie: adminCookie() });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});

describe("cross-family data isolation", () => {
  it("/parent for family A shows KidA's session but not KidB's", async () => {
    const res = await fetch(`${BASE_URL}/parent`, { headers: { Cookie: familyCookie(familyA.id) } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`${prefix}-KidA`);
    expect(body).not.toContain(`${prefix}-KidB`);
  });

  it("/parent for family B shows KidB's session but not KidA's", async () => {
    const res = await fetch(`${BASE_URL}/parent`, { headers: { Cookie: familyCookie(familyB.id) } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(`${prefix}-KidB`);
    expect(body).not.toContain(`${prefix}-KidA`);
  });

  it("family B cannot post an attempt against family A's session (403)", async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/${familyA.sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: familyCookie(familyB.id) },
      body: JSON.stringify({ problemId: seededProblemId, chosenOptionIdx: 0, seconds: 5 }),
    });
    expect(res.status).toBe(403);
  });

  it("family A can post a correct attempt against its own session", async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/${familyA.sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: familyCookie(familyA.id) },
      body: JSON.stringify({
        problemId: seededProblemId,
        chosenOptionIdx: seededCorrectOptionIdx,
        seconds: 5,
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { correct: boolean };
    expect(data.correct).toBe(true);
  });

  it("family B cannot complete family A's session (403)", async () => {
    const res = await fetch(`${BASE_URL}/api/sessions/${familyA.sessionId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: familyCookie(familyB.id) },
      body: JSON.stringify({ score: 0, medianSeconds: 0, perfect: false }),
    });
    expect(res.status).toBe(403);
  });

  it("redemptions are always recorded against the caller's own student", async () => {
    const res = await fetch(`${BASE_URL}/api/redemptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: familyCookie(familyA.id) },
      body: JSON.stringify({ perkId }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { redemption: { studentId: string } };
    expect(data.redemption.studentId).toBe(familyA.studentId);
  });
});
