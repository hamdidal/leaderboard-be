# AI Workflow — Muscle Land Leaderboard

> **Summary:** In this project, all architecture, technology, and design decisions were made **by me**. AI (BE Agent + FE Agent) translated those decisions into code like a **junior developer**. AI never chose a technology on its own; even when it suggested alternatives, final approval and direction always stayed with me.

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

### 2.1 Me — Tech Lead / Reviewer / Decision Maker

| Responsibility         | Example                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Architecture selection | Stateless API, Redis ZSET hot path                              |
| Technology selection   | Fastify, Prisma, BullMQ, React/Vite, TanStack Query             |
| Domain rules           | Reward formula, neighborhood window, week ID format             |
| UX / design direction  | Tier system, podium, dark mode, demo scenarios                  |
| Security & scope       | Internal ingest, CORS allowlist, removal of public earn API     |
| Review & approval      | Code, edge cases, and performance checks on every PR-like cycle |

### 2.2 AI — BE Agent & FE Agent (Junior Developer)

| Agent        | Role                    | Does                                             | Does not                                  |
| ------------ | ----------------------- | ------------------------------------------------ | ----------------------------------------- |
| **BE Agent** | Backend implementation  | Writes API, Redis, Prisma, job, WS code per spec | Choose stack, change architecture         |
| **FE Agent** | Frontend implementation | Produces UI components, hooks, tests, Storybook  | Invent design system, change API contract |

### 2.3 Decision-First Workflow (Best Practice)

```
┌─────────────────────────────────────────────────────────┐
│  1. I MAKE THE DECISION                                 │
│     Stack, architecture, API contract, UX rules         │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  2. I WRITE THE SPEC / PROMPT                           │
│     "Use Fastify + Redis ZSET, expose these endpoints"  │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  3. AI TRANSLATES TO CODE (BE or FE Agent)              │
│     Scaffold, module, component, test, config           │
└──────────────────────────┬──────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│  4. I REVIEW                                            │
│     Correctness, security, performance, scope           │
└──────────────────────────┬──────────────────────────────┘
                           ↓
              Approve → next item  |  Reject → fix prompt
```

I did not tell AI **"pick the best stack."** I said **"I chose this — implement accordingly."**

---

## 3. AI Tools Used

| Tool                    | Role                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| **Cursor (Agent mode)** | IDE where BE / FE agent sessions ran                              |
| **Claude Sonnet 4.6**   | Code generation, refactor, test scaffold, documentation           |
| **Human spec**          | Single source of truth — architecture, stack, acceptance criteria |

**AI's contribution:** Speed — boilerplate, repetitive layers, test scaffold, CI template.  
**Not AI's contribution:** Answering "what should we use?"

---

## 4. Technology Choices — My Decisions, AI's Implementation

This section is the core of the document. Each row covers: **what I chose**, **why**, and **where AI put it in code**.

### 4.1 Shared & Monorepo

| My decision                          | Rationale                                   | AI implemented in                                               |
| ------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| **TypeScript 5.7** (client + server) | Type safety, case requirement               | `tsconfig.json`, strict mode, all modules                       |
| **npm workspaces monorepo**          | Separate client/server with shared contract | Root `package.json`, `client/`, `server/`, `packages/shared/`   |
| **Zod + `@panteon/shared`**          | Single API contract between client/server   | `packages/shared/src/schemas.ts` → inferred types               |
| **Vitest** (both sides)              | Fast, TS-native test runner                 | `server/test/`, `client/src/test/`, `vite.config.ts` test block |
| **ESLint 10 + Prettier 3**           | Consistent code quality                     | `eslint.config.js`, `.prettierrc`, Husky pre-commit             |
| **Node.js ≥ 20**                     | LTS, performance, case requirement          | `engines` field, Railway nixpacks                               |

### 4.2 Backend — My Choices

| My decision                        | Rationale                                         | AI implemented in                                            |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| **Fastify 5** (not Express)        | Low overhead, native TS, plugin ecosystem         | `server/src/app.ts`, plugin wiring                           |
| **PostgreSQL 16 + Prisma 6**       | Persistent data: week meta, users, reward records | `prisma/schema.prisma`, migration, `config/prisma.ts`        |
| **Redis 7 ZSET (ioredis)**         | O(log N) ranking; 2M DAU ingest hot path          | `leaderboard.repo.ts` — `ZREVRANGE`, `ZREVRANK`, `ZINCRBY`   |
| **MongoDB 7**                      | Audit & idempotency (non-relational log data)     | `config/mongo.ts`, `reward_audit`, `earn_events` collections |
| **BullMQ 5** (not node-cron)       | Job deduplication, retry, cron schedule           | `jobs/weekly-reset.worker.ts`, `WEEKLY_CRON`                 |
| **JWT auth** (`@fastify/jwt`)      | Stateless; no session store                       | `modules/auth/auth.plugin.ts`, `authenticate` decorator      |
| **WebSocket + Redis Pub/Sub**      | Live rank updates, stateless fan-out              | `realtime/ws.handler.ts`, `realtime/publish.ts`              |
| **Internal ingest API**            | Players cannot write directly; game server writes | `modules/ingest/`, `X-Internal-Api-Key` middleware           |
| **Zod env validation**             | Runtime config safety                             | `server/src/config/env.ts`                                   |
| **OpenAPI / Swagger**              | API documentation, case deliverable               | `@fastify/swagger` + UI → `/docs`                            |
| **Rate limiting**                  | DDoS protection, ingest throttling                | `@fastify/rate-limit` global + route-level                   |
| **SHA-256 checksum** (post-review) | Distribution integrity                            | `modules/rewards/distribution.ts` — `node:crypto`            |
| **CORS allowlist** (post-review)   | Production security                               | `CORS_ORIGINS` env, `app.ts` cors config                     |

**Redis key schema** also comes from my spec — AI only implemented it:

| Key                     | My definition      | AI implementation         |
| ----------------------- | ------------------ | ------------------------- |
| `lb:current`            | Active week ID     | `lib/redis-keys.ts`       |
| `lb:week:{weekId}`      | ZSET ranking       | `leaderboard.repo.ts`     |
| `pool:week:{weekId}`    | Pool total         | ingest + seed             |
| `cache:top100:{weekId}` | 3s read cache      | `leaderboard.service.ts`  |
| `live:week:{weekId}`    | Pub/Sub channel    | `realtime/publish.ts`     |
| `idem:earn:{key}`       | Ingest idempotency | `score-ingest.service.ts` |

**Domain rules (my spec, AI's algorithm):**

- Rewards: rank 1–3 → 20% / 15% / 10%; rank 4–100 → remaining 55%, weight `(101 - rank)`; remainder to rank 1
- Week ID: `{YYYY}W{WW}`; reset Monday 00:00 UTC
- States: `ACTIVE` → `DISTRIBUTING` → `CLOSED`
- Neighborhood: outside top 100 → 3 above, 2 below

### 4.3 Frontend — My Choices

| My decision                                       | Rationale                                            | AI implemented in                                               |
| ------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **React 18**                                      | Case requirement, component reusability              | All UI in `client/src/`                                         |
| **Vite 6** (not CRA/Webpack)                      | Fast HMR, modern build                               | `vite.config.ts`, dev proxy `/api` + `/live`                    |
| **TanStack React Query 5**                        | Server state, cache, WS invalidation                 | `LeaderboardPage.tsx`, `useLeaderboardLive.ts`                  |
| **Zustand 5** (not Redux)                         | Minimal client state: JWT, demo user                 | `store/uiStore.ts`, localStorage persist                        |
| **Tailwind CSS 3**                                | Fast responsive UI, utility-first                    | `tailwind.config.js`, `globals.css` (~1700 lines CSS variables) |
| **Framer Motion 12**                              | Rank delta, podium animations                        | `Podium.tsx`, `PlayerRow.tsx`, `LeaderboardLayout.tsx`          |
| **i18next + react-i18next**                       | EN + TR, case requirement                            | `i18n/config.ts`, `locales/en.json`, `tr.json`                  |
| **Radix UI** (shadcn-style)                       | Accessible primitives                                | `components/ui/tooltip.tsx`, avatar, scroll-area                |
| **lucide-react**                                  | Consistent icon set                                  | Header, WS badge, tier legend                                   |
| **canvas-confetti**                               | Reward / podium celebration                          | Podium mount effect                                             |
| **Storybook 8.6**                                 | Reusable component catalog (case deliverable)        | `.storybook/`, 7 premium stories                                |
| **clsx + tailwind-merge**                         | `cn()` helper for conditional classes                | `lib/utils.ts`, atom components                                 |
| **Single page, no routing**                       | Leaderboard is one screen; no unnecessary complexity | `main.tsx` → directly `LeaderboardPage`                         |
| **`premium/` feature folder** (not Atomic Design) | Post-review scope simplification                     | `components/premium/*` — single UI path                         |

**UX decisions (mine, AI's UI):**

| UX decision                             | AI implementation                                  |
| --------------------------------------- | -------------------------------------------------- |
| Top 3 podium + crown                    | `Podium.tsx`, `/icons/podium-crown.svg`            |
| Tiers: Podium / Elite / Gold / Silver   | `tierUtils.ts`, `GlobalMetaBar.tsx`, i18n keys     |
| Outside top 100 → sticky neighbor panel | `StickyPlayerContext.tsx`                          |
| Jump-to-me (inside top 100)             | `JumpToMeButton.tsx`, `scrollToPlayer.ts`          |
| Points to top 100 / next tier           | `leaderboardGap.ts`, `LeaderboardPage` me slot     |
| Dark/light theme, FOUC prevention       | `ThemeProvider.tsx`, inline script in `index.html` |
| Muscle Land branding                    | `muscle-land-logo.png`, favicon, header logo       |
| Demo: `?mockPlayer=8000`                | `LeaderboardPage` URL param + seed users           |

### 4.4 Infrastructure & DevOps — My Choices

| My decision                     | Rationale                          | AI implemented in                                 |
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
├── client/                 # FE Agent — code from my FE stack decisions
├── server/                 # BE Agent — code from my BE stack decisions
├── packages/shared/        # My "single contract" decision → Zod schemas
├── load/k6/                # My "performance proof" decision → smoke tests
├── docs/SCALE-INGEST.md    # My ingest architecture decision → documentation
├── .github/workflows/ci.yml
└── AI_WORKFLOW.md
```

---

## 6. Backend — Code Reflection of My Decisions

AI produced the following modules based on my BE technology choices:

| Module          | My definition                        | AI output                                     |
| --------------- | ------------------------------------ | --------------------------------------------- |
| **leaderboard** | Top 100 + neighborhood + cache       | `controller`, `service`, `repo`               |
| **rewards**     | Weekly distribution + crash recovery | `rewards.service.ts`, `distribution.ts`       |
| **ingest**      | ZINCRBY + 2% pool + idempotency      | `ingest.routes.ts`, `score-ingest.service.ts` |
| **auth**        | JWT + demo token (dev)               | `auth.plugin.ts`                              |
| **users**       | Batch upsert, display name           | `user.service.ts`                             |
| **realtime**    | WS + Pub/Sub O(k) fan-out            | `ws.handler.ts`, `publish.ts`                 |
| **jobs**        | BullMQ weekly cron                   | `weekly-reset.worker.ts`                      |

**API surface (my contract, AI's routes):**

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

**BE tests (my invariant list → AI test files):** `distribution`, `week`, `leaderboard`, `score-ingest`, `score-ingest.redis`, `api.routes.integration`

---

## 7. Frontend — Code Reflection of My Decisions

AI produced the `components/premium/` layer based on my FE technology and UX choices:

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

**FE tests (56 tests, 16 files):** I decided which behaviors to test; AI wrote the test code. **BE tests (26 tests, 6 files).**

---

## 8. Shared Package — My "Single Contract" Decision

Sharing the same Zod schema between client and server in the monorepo was **my decision**. AI created the `@panteon/shared` package:

- Leaderboard response schemas (`LeaderboardEntry`, `TopLeaderboardResponse`, `MeLeaderboardResponse`)
- Pool, week, rewards schemas
- Ingest request/response schemas
- `tsc` build → `dist/` — dependency for both workspaces

---

## 9. Review Cycle — Correcting My Decisions in Code

After AI produced the first implementation, I reviewed it. The items below are **new decisions of mine**; AI updated the code accordingly:

| My review decision           | AI code change                                    |
| ---------------------------- | ------------------------------------------------- |
| DISTRIBUTING deadlock risk   | Crash recovery path — ACTIVE reset                |
| N+1 reward insert            | `createMany` batch INSERT                         |
| N+1 user upsert              | Redis pipeline + `createMany(skipDuplicates)`     |
| WS fan-out O(N)              | `Map<channel, Set<WebSocket>>` O(k)               |
| djb2 checksum insufficient   | SHA-256 (`node:crypto`)                           |
| CORS wildcard unsafe         | `CORS_ORIGINS` env allowlist                      |
| JWT secret too short         | min(32) characters                                |
| Hardcoded totalPlayers       | Redis `ZCARD`                                     |
| Atomic Design too complex    | Single `premium/` path; dead code removed         |
| Public earn API out of scope | Removed → internal ingest + seed                  |
| UX gaps                      | `pointsToTop100`, jump-to-me, closed-week rewards |
| Unreliable CI (`\|\| true`)  | Fixed; MongoDB service container added            |

---

## 10. Sample Prompts (Decision-First)

**BE Agent — I state my stack decision and ask for implementation:**

> "Use Fastify 5 + Redis ZSET + Prisma + MongoDB audit + BullMQ. Stateless API. Monorepo scaffold first, then domain layer. Do not change the stack."

**FE Agent — I state my stack and UX decision and ask for implementation:**

> "React 18 + Vite 6 + TanStack Query + Tailwind + Framer Motion. Premium leaderboard: podium, 4–100 list, sticky me context, dark/light, EN+TR. Stay bound to the API contract."

**Post-review — I translate a new decision into code:**

> "Add DISTRIBUTING crash recovery. WS fan-out should be O(k). Remove public earn API — that is my scope decision."

---

## 11. AI Usage Principles

1. **Decision is mine, code is AI's.** Technology selection is never delegated to AI.
2. **Decision-first prompts.** Stack and constraints are explicit in the prompt; if AI suggests alternatives, approval stays with me.
3. **Separate BE / FE agents.** Prevents context mixing; each agent focuses on its stack.
4. **Spec = single source of truth.** If AI goes off-spec, it gets rolled back in review.
5. **Review is mandatory.** First output is not production-ready; deadlock, N+1, and security issues were caught in review.
6. **Scope control.** AI adds extra features (earn simulator, Atomic Design tree) — I cut them.
7. **Test strategy is mine, test code is AI's.** Which invariants to test → me; test files → AI.

---

## 12. Conclusion

This project is a case study of **human-led tech stack selection** + **AI-led implementation**:

- **I** defined architecture, technologies, domain rules, and UX direction
- **BE Agent** translated my Fastify/Redis/Prisma/BullMQ decisions into backend code
- **FE Agent** translated my React/Vite/TanStack Query/Tailwind decisions into premium UI
- **I** reviewed at every stage to verify my decisions were reflected correctly in code

Result: a production-ready monorepo — built with my chosen stack, accelerated by AI.
