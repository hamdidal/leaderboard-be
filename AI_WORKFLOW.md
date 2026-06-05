# AI Workflow — Muscle Land Leaderboard

> **Summary:** In this project, all architecture, technology, and design decisions are **mine**. AI operated as three separate agents: the **Analysis Agent** researched and reported, the **Dev Agent** took the report and my decisions and wrote the code, and the **Test Agent** reviewed and tested the written code. No agent chose technology or architecture; even when they suggested alternatives, the final decision and direction always remained with me. Agent authority is limited strictly to **research → code → test**.

---

## 1. Project Context

**Muscle Land Weekly Leaderboard** — designed for Panteon's idle/clicker mobile games:

- 10M+ registered players, ~2M daily active users
- Weekly-reset leaderboard
- **2%** of earnings automatically flows into the prize pool
- Top 100 receive rewards at week end; pool and rankings reset
- Players see the top 100; if outside, their rank + **3 above / 2 below** neighbors
- PC and mobile friendly, instant-feeling experience

The case's mandatory stack constraint is also defined in **my spec**: Node.js, PostgreSQL, MongoDB, Redis — separate client/server, TypeScript on both sides.

---

## 2. Role Distribution

### 2.1 Me — Tech Lead / Decision Maker / Reviewer

| Responsibility         | Example                                                     |
| ---------------------- | ----------------------------------------------------------- |
| Architecture selection | Stateless API, Redis ZSET hot path                          |
| Technology selection   | Fastify, Prisma, BullMQ, React/Vite, TanStack Query         |
| Domain rules           | Reward formula, neighborhood window, week ID format         |
| UX / design direction  | Tier system, podium, dark mode, demo scenarios              |
| Security & scope       | Internal ingest, CORS allowlist, removal of public earn API |
| Decision & approval    | Code, edge cases, and performance approval every cycle      |

I am the **sole authority** who decides, scopes, and approves. Agents do not make any of these decisions; they only prepare me for decisions (Analysis), turn decisions into code (Dev), and validate code (Test).

### 2.2 Three Agents — Clearly Bounded Authority

| Agent              | Role                 | Does                                                                                    | Does Not                                                  |
| ------------------ | -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Analysis Agent** | Research & Reporting | Researches options, trade-offs, library/pattern comparisons; produces reports           | Does **not** choose technology/architecture or **decide** |
| **Dev Agent**      | Coding               | Takes my decisions + analysis report and writes code (API, Redis, Prisma, jobs, WS, UI) | Does not choose stack or change architecture/API contract |
| **Test Agent**     | Review & Test        | Reviews code, writes/runs tests, reports issues (deadlock, N+1, security)               | Does not decide fixes on its own; reports, I decide       |

The principle is clear: **research–code–test belongs to agents; everything else (decision, scope, approval) is mine.**

### 2.3 Decision-First Workflow (Best Practice)

```
┌──────────────────────────────────────────────────────────┐
│  1. I DEFINE THE PROBLEM                                 │
│     "Which structure for ranking? What should be researched?" │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  2. ANALYSIS AGENT RESEARCHES & REPORTS                  │
│     Options, trade-offs, scale/performance notes           │
│     (e.g. Redis ZSET vs SQL ORDER BY, Fastify vs Express) │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  3. I DECIDE                                             │
│     I read the report → I CHOOSE stack / architecture / UX │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  4. I WRITE SPEC / PROMPT                                │
│     "Use Fastify + Redis ZSET, expose these endpoints"   │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  5. DEV AGENT WRITES CODE                                │
│     Scaffold, modules, components, config — bound to spec │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  6. TEST AGENT REVIEWS & TESTS                           │
│     Correctness, security, performance; REPORTS issues   │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│  7. I REVIEW                                             │
│     Approve → next item  |  Reject → fix decision → Dev   │
└──────────────────────────────────────────────────────────┘
```

I did **not** tell AI **"you pick the best stack."** I said **"I chose this — research / write / test accordingly."**

---

## 3. AI Tools Used

| Tool                    | Role                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| **Cursor (Agent mode)** | IDE where Analysis / Dev / Test agent sessions ran                   |
| **Claude Sonnet 4.6**   | Research & reporting, code generation, refactor, test scaffold, docs |
| **My spec**             | Single source of truth — architecture, stack, acceptance criteria    |

**What AI contributed:** Speed — research synthesis, boilerplate, repetitive layers, test scaffold, CI template.
**What AI did _not_ contribute:** Answering "what should we use?"

---

## 4. Technology Choices — My Decisions, Agent Implementation

This section is the core of the document. Each row covers: **what I chose**, **why**, **which agent put it where**. The Analysis Agent produced a comparison report behind every row; I made the decision; the Dev Agent turned it into code; the Test Agent validated it.

### 4.1 Shared & Monorepo

| My decision                          | Rationale                                | Agent implementation (code)                                   |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| **TypeScript 5.7** (client + server) | Type safety, case requirement            | `tsconfig.json`, strict mode, all modules                     |
| **npm workspaces monorepo**          | Separate client/server + shared contract | Root `package.json`, `client/`, `server/`, `packages/shared/` |
| **Zod + `@panteon/shared`**          | Single API contract across client/server | `packages/shared/src/schemas.ts` → inferred types             |
| **Vitest** (both sides)              | Fast, TS-native test runner              | `server/test/`, `client/src/test/`, `vite.config.ts` test     |
| **ESLint 10 + Prettier 3**           | Consistent code quality                  | `eslint.config.js`, `.prettierrc`, Husky pre-commit           |
| **Node.js ≥ 20**                     | LTS, performance, case requirement       | `engines` field, Railway nixpacks                             |

### 4.2 Backend — My Decisions

| My decision                        | Rationale                                         | Agent implementation (code)                                |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| **Fastify 5** (not Express)        | Low overhead, native TS, plugin ecosystem         | `server/src/app.ts`, plugin wiring                         |
| **PostgreSQL 16 + Prisma 6**       | Persistent data: week meta, users, reward records | `prisma/schema.prisma`, migration, `config/prisma.ts`      |
| **Redis 7 ZSET (ioredis)**         | O(log N) ranking; 2M DAU ingest hot path          | `leaderboard.repo.ts` — `ZREVRANGE`, `ZREVRANK`, `ZINCRBY` |
| **MongoDB 7**                      | Audit & idempotency (non-relational logs)         | `config/mongo.ts`, `reward_audit`, `earn_events`           |
| **BullMQ 5** (not node-cron)       | Job deduplication, retry, cron schedule           | `jobs/weekly-reset.worker.ts`, `WEEKLY_CRON`               |
| **JWT auth** (`@fastify/jwt`)      | Stateless; no session store                       | `modules/auth/auth.plugin.ts`, `authenticate` decorator    |
| **WebSocket + Redis Pub/Sub**      | Live rank updates, stateless fan-out              | `realtime/ws.handler.ts`, `realtime/publish.ts`            |
| **Internal ingest API**            | Players cannot write directly; game server writes | `modules/ingest/`, `X-Internal-Api-Key` middleware         |
| **Zod env validation**             | Runtime config safety                             | `server/src/config/env.ts`                                 |
| **OpenAPI / Swagger**              | API documentation, case deliverable               | `@fastify/swagger` + UI → `/docs`                          |
| **Rate limiting**                  | DDoS protection, ingest throttling                | `@fastify/rate-limit` global + route level                 |
| **SHA-256 checksum** (post-review) | Distribution integrity                            | `modules/rewards/distribution.ts` — `node:crypto`          |
| **CORS allowlist** (post-review)   | Production security                               | `CORS_ORIGINS` env, `app.ts` cors config                   |

**Redis key schema** also came from my spec — agents only implemented it:

| Key                     | My definition      | Agent implementation      |
| ----------------------- | ------------------ | ------------------------- |
| `lb:current`            | Active week ID     | `lib/redis-keys.ts`       |
| `lb:week:{weekId}`      | ZSET ranking       | `leaderboard.repo.ts`     |
| `pool:week:{weekId}`    | Pool total         | ingest + seed             |
| `cache:top100:{weekId}` | 3s read cache      | `leaderboard.service.ts`  |
| `live:week:{weekId}`    | Pub/Sub channel    | `realtime/publish.ts`     |
| `idem:earn:{key}`       | Ingest idempotency | `score-ingest.service.ts` |

**Domain rules (my spec, agent algorithm):**

- Rewards: ranks 1–3 → 20% / 15% / 10%; ranks 4–100 → remaining 55%, weight `(101 - rank)`; remainder to rank 1
- Week ID: `{YYYY}W{WW}`; reset Monday 00:00 UTC
- States: `ACTIVE` → `DISTRIBUTING` → `CLOSED`
- Neighborhood: outside top 100 → 3 above, 2 below

### 4.3 Frontend — My Decisions

| My decision                                       | Rationale                                     | Agent implementation (code)                            |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| **React 18**                                      | Case requirement, component reusability       | All UI in `client/src/`                                |
| **Vite 6** (not CRA/Webpack)                      | Fast HMR, modern build                        | `vite.config.ts`, dev proxy `/api` + `/live`           |
| **TanStack React Query 5**                        | Server state, cache, WS invalidation          | `LeaderboardPage.tsx`, `useLeaderboardLive.ts`         |
| **Zustand 5** (not Redux)                         | Minimal client state: JWT, demo user          | `store/uiStore.ts`, localStorage persist               |
| **Tailwind CSS 3**                                | Fast responsive UI, utility-first             | `tailwind.config.js`, `globals.css`                    |
| **Framer Motion 12**                              | Rank delta, podium animations                 | `Podium.tsx`, `PlayerRow.tsx`, `LeaderboardLayout.tsx` |
| **i18next + react-i18next**                       | EN + TR, case requirement                     | `i18n/config.ts`, `locales/en.json`, `tr.json`         |
| **Radix UI** (shadcn-style)                       | Accessible primitives                         | `components/ui/tooltip.tsx`, avatar, scroll-area       |
| **lucide-react**                                  | Consistent icon set                           | Header, WS badge, tier legend                          |
| **canvas-confetti**                               | Reward / podium celebration                   | Podium mount effect                                    |
| **Storybook 8.6**                                 | Reusable component catalog (case deliverable) | `.storybook/`, 7 premium stories                       |
| **clsx + tailwind-merge**                         | `cn()` helper for conditional classes         | `lib/utils.ts`, atom components                        |
| **Single page, no routing**                       | Leaderboard is one screen                     | `main.tsx` → directly `LeaderboardPage`                |
| **`premium/` feature folder** (not Atomic Design) | Post-review scope simplification              | `components/premium/*` — single UI path                |

**UX decisions (mine, agent UI):**

| UX decision                             | Agent implementation                               |
| --------------------------------------- | -------------------------------------------------- |
| Top 3 podium + crown                    | `Podium.tsx`, `/icons/podium-crown.svg`            |
| Tiers: Podium / Elite / Gold / Silver   | `tierUtils.ts`, `GlobalMetaBar.tsx`, i18n keys     |
| Outside top 100 → sticky neighbor panel | `StickyPlayerContext.tsx`                          |
| Jump-to-me (inside top 100)             | `JumpToMeButton.tsx`, `scrollToPlayer.ts`          |
| Points to top 100 / next tier           | `leaderboardGap.ts`, `LeaderboardPage` me slot     |
| Dark/light theme, FOUC prevention       | `ThemeProvider.tsx`, inline script in `index.html` |
| Muscle Land branding                    | `muscle-land-logo.png`, favicon, header logo       |
| Demo: `?mockPlayer=8000`                | `LeaderboardPage` URL param + seed users           |

### 4.4 Infrastructure & DevOps — My Decisions

| My decision                     | Rationale                          | Agent implementation (code)                       |
| ------------------------------- | ---------------------------------- | ------------------------------------------------- |
| **GitHub Actions CI**           | Lint + test + build automation     | `.github/workflows/ci.yml`                        |
| **Husky + lint-staged**         | Pre-commit format/lint             | `.husky/pre-commit`                               |
| **k6 load test**                | Read/write smoke benchmark         | `load/k6/leaderboard-smoke.js`, `score-ingest.js` |
| **Railway (BE) + Netlify (FE)** | Managed deploy (no Docker in prod) | `server/railway.toml` (nixpacks), Netlify config  |
| **Neon + Upstash + Atlas**      | Managed DB target                  | `.env.example`, README deploy notes               |

Local dev uses managed or locally installed Postgres, Redis, and MongoDB — not Docker Compose.

---

## 5. Project Structure

```
panteon-leaderboard/
├── client/                 # Dev Agent — code from my FE stack decisions
├── server/                 # Dev Agent — code from my BE stack decisions
├── packages/shared/        # My "single contract" decision → Zod schemas
├── load/k6/                # My "performance proof" decision → smoke tests
├── docs/SCALE-INGEST.md    # My ingest architecture decision → documentation
├── .github/workflows/ci.yml
└── AI_WORKFLOW.md
```

---

## 6. Backend — How My Decisions Became Code

I read the Analysis Agent's reports, made BE technology choices; the Dev Agent produced the modules below; the Test Agent validated them:

| Module          | My definition                        | Dev Agent output                              |
| --------------- | ------------------------------------ | --------------------------------------------- |
| **leaderboard** | Top 100 + neighborhood + cache       | `controller`, `service`, `repo`               |
| **rewards**     | Weekly distribution + crash recovery | `rewards.service.ts`, `distribution.ts`       |
| **ingest**      | ZINCRBY + 2% pool + idempotency      | `ingest.routes.ts`, `score-ingest.service.ts` |
| **auth**        | JWT + demo token (dev)               | `auth.plugin.ts`                              |
| **users**       | Batch upsert, display name           | `user.service.ts`                             |
| **realtime**    | WS + Pub/Sub O(k) fan-out            | `ws.handler.ts`, `publish.ts`                 |
| **jobs**        | BullMQ weekly cron                   | `weekly-reset.worker.ts`                      |

**API surface (my contract, Dev Agent routes):**

| Method | Path                                          | Auth             |
| ------ | --------------------------------------------- | ---------------- |
| GET    | `/api/leaderboard/top`                        | —                |
| GET    | `/api/leaderboard/me`                         | JWT              |
| GET    | `/api/pool`, `/api/week/current`              | —                |
| GET    | `/api/rewards/latest`, `/api/rewards/:weekId` | —                |
| POST   | `/api/internal/scores`, `/batch`              | Internal API Key |
| POST   | `/api/admin/trigger-reset`                    | JWT              |
| POST   | `/api/auth/demo-token`                        | — (dev)          |
| GET    | `/healthz`, `/readyz`                         | —                |
| WS     | `/live?weekId=`                               | —                |

**BE tests (my invariant list → Test Agent test files):** `distribution`, `week`, `leaderboard`, `score-ingest`, `score-ingest.redis`, `api.routes.integration`

---

## 7. Frontend — How My Decisions Became Code

The Dev Agent built the `components/premium/` layer from my FE technology and UX choices:

| Component                  | My UX decision                             |
| -------------------------- | ------------------------------------------ |
| `LeaderboardLayout`        | Header, timer, WS badge, pool, tier legend |
| `Podium`                   | Top 3, crown, medal ring, animation        |
| `RankedList` + `PlayerRow` | 4–100 list, rank delta, "me" highlight     |
| `StickyPlayerContext`      | Outside top 100 → 3↑ / 2↓ neighbor panel   |
| `GlobalMetaBar`            | Tier legend, totalPlayers, 2% pool rate    |
| `JumpToMeButton`           | Scroll-to-me inside top 100                |
| `WeekRewardsPanel`         | Closed-week rewards                        |
| `StatusBanner`             | DISTRIBUTING / CLOSED states               |

**FE tests (56 tests, 16 files):** I decided which behaviors to test; the Test Agent wrote the test code. **BE tests (26 tests, 6 files).**

---

## 8. Shared Package — My "Single Contract" Decision

Sharing the same Zod schema between client and server in the monorepo was **my decision.** The Dev Agent created the `@panteon/shared` package:

- Leaderboard response schemas (`LeaderboardEntry`, `TopLeaderboardResponse`, `MeLeaderboardResponse`)
- Pool, week, rewards schemas
- Ingest request/response schemas
- `tsc` build → `dist/` — dependency for both workspaces

---

## 9. Review & Test Cycle — Correcting My Decisions in Code

The Test Agent reviewed the first implementation and **reported** the issues below. I gave the fix direction (these are my **new decisions**); the Dev Agent updated the code; the Test Agent validated again:

| Issue reported by Test Agent | My fix decision           | Dev Agent code change                             |
| ---------------------------- | ------------------------- | ------------------------------------------------- |
| DISTRIBUTING deadlock risk   | Add crash recovery        | Crash recovery path — ACTIVE reset                |
| N+1 reward insert            | Switch to batch           | `createMany` batch INSERT                         |
| N+1 user upsert              | Pipeline + skipDuplicates | Redis pipeline + `createMany(skipDuplicates)`     |
| WS fan-out O(N)              | Reduce to O(k)            | `Map<channel, Set<WebSocket>>` O(k)               |
| djb2 checksum insufficient   | Use SHA-256               | SHA-256 (`node:crypto`)                           |
| CORS wildcard unsafe         | Move to allowlist         | `CORS_ORIGINS` env allowlist                      |
| JWT secret too short         | Enforce min 32 characters | `min(32)` characters                              |
| Hardcoded totalPlayers       | Make dynamic              | Redis `ZCARD`                                     |
| Atomic Design too complex    | Simplify to single path   | Single `premium/` path; dead code removed         |
| Public earn API out of scope | Remove (scope decision)   | Removed → internal ingest + seed                  |
| UX gaps                      | Add related flows         | `pointsToTop100`, jump-to-me, closed-week rewards |
| Unreliable CI (`\|\| true`)  | Fix                       | Fixed; MongoDB service container added            |

> Note: The Test Agent only **reports findings.** How each issue is resolved is my decision — the Test Agent does not apply fix decisions on its own.

---

## 10. Sample Prompts (Decision-First)

**Analysis Agent — I request research, decision stays with me:**

> "Compare Redis ZSET vs SQL `ORDER BY ... LIMIT` for weekly ranking under 2M DAU. Produce a report on read/write complexity, scalability, and operational cost. The decision is mine — only report options and trade-offs."

**Dev Agent — I state my stack decision, request implementation:**

> "Use Fastify 5 + Redis ZSET + Prisma + MongoDB audit + BullMQ. Stateless API. Monorepo scaffold first, then domain layer. Do not change the stack — that is my decision."

**Dev Agent (FE) — I state stack + UX decision, request implementation:**

> "React 18 + Vite 6 + TanStack Query + Tailwind + Framer Motion. Premium leaderboard: podium, 4–100 list, sticky me context, dark/light, EN+TR. Stay bound to the API contract."

**Test Agent — I request review and test, fix decision is mine:**

> "Review the rewards distribution service and ingest hot path. List issues around deadlock, N+1, security, and idempotency. Do not implement fixes — only report findings; I will decide."

**After review — I turn my new decision into code:**

> "Add DISTRIBUTING crash recovery. WS fan-out should be O(k). Remove public earn API — that is my scope decision."

---

## 11. AI Usage Principles

1. **Decision is mine, code is the agents'.** Technology selection is never delegated to AI.
2. **Decision-first prompts.** Stack and constraints are explicit in the prompt; if an agent suggests alternatives, approval stays with me.
3. **Three separate agents.** Analysis / Dev / Test separation prevents context mixing; each agent focuses on one job.
4. **Authority boundary is clear.** Analysis researches+reports, Dev writes code, Test reviews+tests — none of them decide.
5. **Spec = single source of truth.** If an agent goes outside the spec, it is rolled back in review.
6. **Review is mandatory.** First output is not production-ready; deadlock, N+1, and security issues were caught in review.
7. **Scope control.** If agents add extra features (earn simulator, Atomic Design tree), I cut them.
8. **Test strategy is mine, test code is the Test Agent's.** Which invariants to test → me; test files → Test Agent.

---

## 12. Conclusion

This project is a case study in **human-led decisions** + **AI-led research/implementation/testing**:

- **I** defined architecture, technologies, domain rules, and UX direction
- **Analysis Agent** researched options and reported — prepared me to decide, did not decide
- **Dev Agent** turned my Fastify/Redis/Prisma/BullMQ and React/Vite/TanStack Query/Tailwind decisions into code
- **Test Agent** reviewed and tested code, reported issues — fix decisions remained with me
- **I** reviewed at every stage to verify my decisions were reflected correctly in code

Result: a production-ready monorepo built with my chosen stack, accelerated by AI.
