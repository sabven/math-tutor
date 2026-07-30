# Math Tutor — Build Plan
Tech stack, AWS setup, and phase-by-phase delivery plan.
Companion files: `data/chapters/fractions.json`, `problem-generation-prompt.md`

---

## 1. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | One codebase for UI + API routes; first-class on Amplify; Claude Code works very well with it |
| Styling | Tailwind CSS | Fast iteration, consistent design |
| Charts | Recharts | Parent dashboard: mastery bars, trend lines |
| Math rendering | KaTeX (react-katex) | Renders the `statement_latex` field beautifully; much faster than MathJax |
| Answer verification | math.js | Evaluates `verify_expression`; substitution checks for equations |
| ORM | Prisma | Type-safe DB access; painless migration SQLite → Postgres → RDS later |
| Database | PostgreSQL — Neon free tier for v1 | Serverless-friendly (Amplify functions can't use local SQLite); migrate to RDS by changing one connection string |
| AI | Anthropic API — claude-sonnet-4-6 | Generation (temp 0.7), hints (temp 0.3), reports (temp 0.3). Swap to Bedrock later if you want all-AWS |
| Email | Amazon SES | Daily/weekly parent reports, ~cents/month |
| Scheduling | Amazon EventBridge Scheduler → Lambda | Nightly problem batch + evening report job |
| Hosting/CI | AWS Amplify Hosting | Push to GitHub → auto build & deploy; SSR + API routes handled |
| Auth (v1) | Parent PIN (hashed, httpOnly cookie session) | Enough for one family |
| Auth (later) | Amazon Cognito or Clerk | When other families join |
| Repo | GitHub | Amplify connects directly |

Optional later: SymPy microservice (Python Lambda) for symbolic equation checking at levels 9–10 if substitution checks ever feel insufficient.

---

## 2. Architecture

```
                    ┌─────────────────────────────┐
  Smaya (tablet) ──▶│  Next.js on Amplify Hosting │◀── You (parent, PIN)
                    │  /play        /parent       │
                    │  API routes (Lambda)        │
                    └──────┬───────────┬──────────┘
                           │           │
                 ┌─────────▼──┐   ┌────▼──────────┐
                 │ PostgreSQL │   │ Anthropic API │  (live: hints, retries)
                 │  (Neon)    │   └───────────────┘
                 └─────▲──────┘
                       │
     EventBridge ──▶ Lambda "nightly-batch"
     (2:00 AM SGT)     ├─ read student state
                       ├─ call Claude: generate batch (+30% extra)
                       ├─ verify all with math.js, discard failures
                       └─ save session for tomorrow
     EventBridge ──▶ Lambda "daily-report"
     (8:00 PM SGT)     └─ compile stats → Claude writes summary → SES email
```

Key principle: problems are generated and verified ahead of time. Smaya never waits on an AI call except for hints/retries, which tolerate a 1–2 s delay.

---

## 3. Data Model (Prisma sketch)

```
Student      id, name, currentLevel, createdAt,
             sessionLength Int?, activeSubtopicIds Json?, difficultyCeiling Int?,
             speedTargetsEnabled Boolean (parent-tunable overrides; null = chapter default)
Chapter      id, config Json, active Boolean, version
Problem      id, chapterId, subtopicId, level, statement, statementLatex,
             answer Json, options Json (shuffled, with misconceptionIds),
             hint, solutionSteps Json, estimatedSeconds, verified Boolean,
             usedAt DateTime?
Session      id, studentId, date, status (pending/active/complete),
             problemIds Json, score, medianSeconds, perfect Boolean
Attempt      id, sessionId, problemId, chosenOptionIdx, correct Boolean,
             seconds Int, misconceptionId String?, retryOfAttemptId?
             (retryOfAttemptId is schema-only — never populated; retry/original
             pairing is inferred at read time from problemIds order instead)
SkillScore   id, studentId, subtopicId, elo Int, updatedAt
Perk         id, name, pointCost, active, icon                    -- schema only, no logic yet (Phase 4)
PointsLedger id, studentId, delta, reason, createdAt               -- schema only, no logic yet (Phase 4)
Redemption   id, studentId, perkId, status (pending/granted), createdAt  -- schema only, no logic yet (Phase 4)
ParentReport id, date, type (daily/weekly), body, sentAt           -- schema only, no logic yet (Phase 3 email)
```

No migration history is tracked (`prisma/migrations` doesn't exist) — schema changes are applied
straight to the Neon DB with `npx prisma db push`, matching this project's solo-dev iteration speed.

Everything keyed by `studentId` from day one — multi-kid ready.

---

## 4. AWS Setup (one-time, ~1 hour)

1. **Accounts & keys**
   - AWS account with an IAM user (not root) + MFA.
   - Anthropic API key from console.anthropic.com.
   - Neon account → create Postgres DB → copy connection string.
   - GitHub repo created (Claude Code pushes here).

2. **Amplify Hosting**
   - AWS Console → Amplify → "Host web app" → connect the GitHub repo, main branch.
   - Framework auto-detected as Next.js. Accept defaults.
   - Environment variables (Amplify → App settings → Environment variables):
     - `DATABASE_URL` (Neon connection string)
     - `ANTHROPIC_API_KEY`
     - `PARENT_PIN_HASH_B64` (base64 of the bcrypt hash of your PIN — base64
       because Next.js's env loader mangles literal `$` characters in bcrypt hashes)
     - `JOB_SECRET` (shared secret for the `X-Job-Secret` header on `/api/jobs/*`)
     - `SES_FROM_EMAIL`, `PARENT_EMAIL` (unused until the Phase 3 email work ships)
   - Every git push now auto-deploys. Amplify gives you an https URL immediately;
     add a custom domain later if you want (Amplify → Domain management).

3. **SES (email)**
   - SES console (pick region ap-southeast-1, Singapore) → verify your sender
     email and your recipient email.
   - v1 can run entirely in SES sandbox mode since you only email yourself
     (sandbox allows sending to verified addresses). Request production access
     only when other parents join.

4. **Scheduled jobs**
   - Two Lambda functions (Node 20), deployed via a tiny SAM/CDK template or
     even manually for v1:
     - `nightly-batch` — EventBridge Scheduler cron `0 18 * * ? *` UTC
       (= 2:00 AM Singapore).
     - `daily-report` — cron `0 12 * * ? *` UTC (= 8:00 PM Singapore).
   - Both need `DATABASE_URL` + `ANTHROPIC_API_KEY` (and SES send permission
     for the report one) in their env/role.
   - Simpler alternative for week 1: make these two Next.js API routes
     protected by a secret header, and trigger them with EventBridge →
     API destinations. Zero extra deploy pipeline; graduate to real Lambdas
     later.
   - **What's actually running**: `nightly-batch` is wired up via a GitHub
     Actions cron (`.github/workflows/nightly-batch.yml`) calling the secret-
     header-protected route instead of EventBridge — no AWS scheduling infra
     needed at all. `daily-report` is not implemented (see Phase 3).

5. **Budget guard**
   - AWS Budgets: alert at $10/month. Anthropic console: set a monthly spend
     limit. A runaway loop in a nightly job should hit a tripwire, not your
     card.

**Expected v1 cost:** Amplify free tier ≈ $0, Neon free tier $0, SES < $0.10,
Lambda/EventBridge ≈ $0, Anthropic API ≈ $1–3/month for daily sessions.
Total: under $5/month.

---

## 5. Phase Plan

### Phase 1 — Playable skeleton (goal: Smaya uses it this week) ✅ Done
Build:
- Project scaffold: Next.js + TS + Tailwind + Prisma + Neon connection.
- Load `data/chapters/fractions.json` into the Chapter table via seed script.
- Generation module: fills the prompt template, calls Claude, parses JSON,
  runs math.js verification + structural checks, shuffles options, saves
  Problems. Expose as `POST /api/jobs/generate` (secret header).
- `/play`: today's session — one problem at a time, 4 big tappable cards,
  KaTeX rendering, per-problem timer (subtle progress bar, not a countdown),
  instant right/wrong feedback, end-of-session score screen.
- `/parent`: PIN gate + a raw list of sessions and attempts (ugly is fine).
- Deploy to Amplify.
Acceptance: generate a 10-problem session with zero unverified problems;
Smaya completes it on a tablet over the deployed URL.

### Phase 2 — Adaptive engine + learning loop ✅ Done
Build:
- Elo per subtopic updated on every attempt (weight by difficulty + time
  vs. target). Level-up/level-down rules from the chapter config.
- Batch spec builder: 60% weakest / 20% review / 20% stretch mix.
- Wrong-answer flow: Socratic hint (live AI call) → worked solution →
  retry problem with new numbers. Retry correctness tracked separately.
- Kid-friendly `/play` redesign: sounds, confetti, streak flame, silly
  correct-answer messages, level-up/down banner.
- Nightly pre-generation: `.github/workflows/nightly-batch.yml` calls
  `POST /api/jobs/generate` at 18:00 UTC (2:00 AM SGT) via a GitHub Actions
  cron, not the originally-spec'd EventBridge → Lambda (the app runs on
  Amplify Hosting with no Lambda deploy pipeline, so a scheduled workflow
  hitting the existing secret-header-protected API route is the equivalent
  with zero extra infra). Requires the `JOB_SECRET` repo secret to be set
  in GitHub (Settings → Secrets and variables → Actions) to match Amplify's
  `JOB_SECRET` env var; optionally `APP_URL` to override the hardcoded
  Amplify URL fallback in the workflow.
Acceptance: after a week of sessions, levels and Elo visibly move, and
wrong answers always route through hint → solution → retry.
`getOrCreateTodaySession` still generates lazily on first `/play` visit as a
fallback if a nightly run is ever missed, so a skipped workflow run degrades
gracefully rather than breaking anything.

### Phase 3 — Parent dashboard + reports (in progress)
Done:
- `/parent` dashboard rewrite: wrong attempts show the actual question,
  chosen vs. correct answer, and the misconception's plain-language
  name/description (not just an `M3`/`M8` code); retries are labeled against
  the question they retried instead of being flattened into the count.
- Filters: session (latest / all recent / a specific past session), concept
  (subtopic), and wrong-only — combine freely, default view is latest session.
- "Concepts to work on" ranking: subtopics sorted by wrong-answer rate across
  the last 30 sessions, with the top misconception per concept, clickable
  into the concept filter.
- Mastery bars per subtopic (Elo, via Recharts), accuracy & speed trend lines
  over the last 14 completed sessions, day streak tile.
- Parent controls: session length, active subtopics, difficulty ceiling,
  speed-targets-required-to-level-up toggle — editable from a Settings panel
  on `/parent`, stored on the `Student` row, applied in `lib/session.ts`,
  `/api/jobs/generate`, and the attempts route's level-change logic.
Not done:
- Daily email (session summary) + weekly email (AI-written letter using the
  weekly-report prompt) via SES. Needs real AWS SES setup (verified
  sender/recipient) before any code here can actually send something —
  infra work, not just app code. `ParentReport` table exists, unused.
Acceptance: you stop needing to open the database to know how she's doing.

### Phase 4 — Perks & motivation
Build:
- Points: completion points + perfect-score bonus + beat-speed-target bonus
  + streak milestones (reward effort and streaks, not only perfection).
- Perk catalog you manage in `/parent`; Smaya sees a perk shop in `/play`,
  redeems, you approve → status "granted".
- ~~Small celebrations: streak flame, confetti on perfect, level-up moment.~~
  Already shipped in Phase 2's kid-friendly redesign.
Acceptance: Smaya asks to do her session without being told. (The real test.)
Not started: `Perk`/`PointsLedger`/`Redemption` tables exist in the schema but
have no points-awarding logic or shop UI behind them yet.

### Phase 5 — Extensibility & free input
Build:
- Chapter authoring: upload/edit a chapter config JSON in `/parent`,
  validate it, activate it. Adding "Decimals" = adding a file.
- Free-input answer mode: fraction input widget (numerator/denominator
  boxes + whole-number box), enabled per level or per problem type.
  Grade by comparing structured answers (accept unsimplified but flag it).
- Mixed sessions: MCQ at lower levels, free input at 7+, matching how
  olympiads actually work.
Acceptance: a second chapter runs end-to-end without code changes.

### Phase 6 (future, when other kids join)
Cognito/Clerk auth, multi-student households, RDS migration, placement test
for new students (adaptive 15-problem calibration), per-grade calibration
data from accumulated attempt history, Bedrock migration if desired.

---

## 6. Order of Operations, Day One with Claude Code

1. Create GitHub repo, connect Amplify, set env vars (Section 4) — do this
   BEFORE writing code, so deploys work from the first commit.
2. Give Claude Code: this file + the chapter config + the prompt templates.
3. Ask for Phase 1 only. Resist adding Phase 2 features until Phase 1 is
   deployed and Smaya has used it once.
4. After each phase: use it for a few real days before starting the next.
   Real sessions will reorder your priorities better than any plan.
