# Muscle Land Leaderboard

Weekly leaderboard for idle/clicker games — **Muscle Land**. Stateless API with Redis ZSET ranking, PostgreSQL persistence, MongoDB audit, BullMQ prize distribution, and a React premium UI with live WebSocket updates.

## Live demo

|                  | URL                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**     | [https://panteon-leaderboard.netlify.app/](https://panteon-leaderboard.netlify.app/)                                         |
| **Backend API**  | [https://panteon-leaderboard-server-production.up.railway.app](https://panteon-leaderboard-server-production.up.railway.app) |
| **Current week** | [GET /api/week/current](https://panteon-leaderboard-server-production.up.railway.app/api/week/current)                       |
| **Health**       | [GET /healthz](https://panteon-leaderboard-server-production.up.railway.app/healthz)                                         |
| **OpenAPI**      | [/docs](https://panteon-leaderboard-server-production.up.railway.app/docs)                                                   |

| Frontend URL                                                                 | Scenario                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| [panteon-leaderboard.netlify.app](https://panteon-leaderboard.netlify.app/)  | Default — demo user ~rank 76 (inside top 100) |
| [?mockPlayer=8000](https://panteon-leaderboard.netlify.app/?mockPlayer=8000) | Outside top 100 — sticky neighbor panel       |

Production is seeded (~50K players). For **last week UI**, also run `npm run seed:closed-week` on the backend (see [leaderboard-be](https://github.com/hamdidal/leaderboard-be) README). Netlify env: `VITE_API_URL=https://panteon-leaderboard-server-production.up.railway.app`, `VITE_WS_URL=wss://panteon-leaderboard-server-production.up.railway.app`.

## Repositories

Case submission uses **separate client and server repos**:

| Repo         | URL                                                                              |
| ------------ | -------------------------------------------------------------------------------- |
| **Backend**  | [github.com/hamdidal/leaderboard-be](https://github.com/hamdidal/leaderboard-be) |
| **Frontend** | [github.com/hamdidal/leaderboard-fe](https://github.com/hamdidal/leaderboard-fe) |

This folder (`panteon-leaderboard`) is the full-stack development monorepo; keep deploy repos in sync when shipping changes.

## Stack

### Backend

| Layer       | Technology                        |
| ----------- | --------------------------------- |
| API         | Node.js 20, Fastify 5, TypeScript |
| Ranking     | Redis 7 ZSET                      |
| Persistence | PostgreSQL 16, Prisma 6           |
| Audit       | MongoDB 7                         |
| Jobs        | BullMQ                            |
| Realtime    | WebSocket + Redis Pub/Sub         |
| Auth        | JWT                               |
| Validation  | Zod (`packages/shared`)           |

### Frontend (`client/`)

| Layer        | Technology             |
| ------------ | ---------------------- |
| UI           | React 18, TypeScript   |
| Build        | Vite 6                 |
| Server state | TanStack React Query 5 |
| Client state | Zustand 5              |
| Styling      | Tailwind CSS 3         |
| Animation    | Framer Motion 12       |
| i18n         | i18next (EN + TR)      |
| Components   | Storybook 8            |

## Structure

```
panteon-leaderboard/
├── client/            # React/Vite frontend
├── server/            # Fastify API
├── packages/shared/   # Shared Zod schemas & types
├── load/k6/           # Load tests
├── docs/              # Ingest & scale notes
└── .env.example
```

## Quick start

**Prerequisites:** Node.js 20+, PostgreSQL, MongoDB, Redis (local install or managed — Neon, Upstash, Atlas).

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run build -w packages/shared
cd server && npx prisma migrate deploy && cd ..
npm run seed
```

### Backend

```bash
npm run dev -w server
```

- API: http://localhost:3001
- Health: http://localhost:3001/healthz
- Readiness: http://localhost:3001/readyz
- OpenAPI: http://localhost:3001/docs

### Frontend

```bash
npm run dev -w client
```

- App: http://localhost:5173 (proxies `/api` and `/live` to the backend)

#### Loading skeleton tests

| Method                 | Command                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Unit / integration** | `npm run test -w client -- src/test/LeaderboardPage.test.tsx`                                      |
| **Storybook**          | `npm run storybook -w client` → **Premium/HeaderMetaSkeleton** or **Premium/RankedList → Loading** |

---

## Demo players

After `npm run seed`, two fixed demo users are placed in the leaderboard. The frontend picks one automatically based on how you open the site.

| How you open the site                                                                                                 | User ID          | Approx. rank                | Experience                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Default** — open the URL with no query params (e.g. `http://localhost:5173/`)                                       | `demo-user`      | **~76** (inside top 100)    | Your row appears in the main list with highlight; **Jump to me** works; estimated reward visible |
| **Outside top 100** — add `?mockPlayer=8000` or `?mockPlayer=outside` (e.g. `http://localhost:5173/?mockPlayer=8000`) | `demo-user-8000` | **~8000** (outside top 100) | Sticky **neighbor panel** (3 players above, 2 below); points-to-top-100 hint                     |

The seed script prints exact ranks to the console:

```text
Demo (default): demo-user — rank 76
Demo (outside): demo-user-8000 — rank 8000
```

### Manual demo token (development)

```bash
curl -X POST http://localhost:3001/api/auth/demo-token \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo-user"}'
```

Use `demo-user-8000` for the outside-top-100 scenario. Disabled when `NODE_ENV=production` (unless `DISABLE_DEMO_AUTH=false`).

---

## Last week & week recap (UI)

When a week closes, the app shows **last week’s prize results** separately from **this week’s live leaderboard**. This matches the case flow: rewards persist in Postgres; the live Redis ranking resets for the new week.

### What you see

| UI piece                  | Purpose                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Week recap modal**      | One-time summary after a closed week: winner, pool total, your rank & prize. Dismiss with **Continue to this week**. |
| **Last week section**     | Collapsible panel above the podium (`Final` badge, read-only reward list).                                           |
| **This week divider**     | Labels the live podium + top 100 below last week’s results.                                                          |
| **Compact header trophy** | When scrolling collapses the header, tap the trophy chip to jump to last week’s section.                             |
| **Distributing banner**   | Shown while rewards are being calculated (WS `week_reset` or week status `DISTRIBUTING`).                            |

Recap visibility is stored in `localStorage` (`panteon-recap-dismissed-week`) so it is not shown again for the same closed week.

### How to test (case reviewer)

**Prerequisites:** Postgres, Redis, MongoDB running; `.env` configured; backend + frontend dev servers up.

#### Option A — Quick UI test (recommended, no mid-week reset)

Does **not** close the current week. Seeds a fake **previous** closed week in Postgres only.

From the **monorepo root** (`panteon-leaderboard`, not `leaderboard-fe`):

```bash
npm run seed                 # current week live leaderboard (Redis)
npm run seed:closed-week     # previous ISO week → CLOSED + 100 rewards in Postgres
```

Then open http://localhost:5173 and hard-refresh.

**Expected:**

1. **Recap modal** opens automatically (winner, pool, your result for `demo-user` ~rank 76).
2. Click **Continue to this week** — modal closes; main view scrolls to the top.
3. **Last week** block appears **above** the podium (collapsed by default — expand for full top-100 reward list).
4. **This week · Live** label, then podium + current-week rankings.
5. Scroll down — header collapses; **trophy chip** in the compact bar scrolls to the last-week section.

**Verify API:**

```bash
curl -s http://localhost:3001/api/rewards/latest | head -c 400
```

`rewards` should be a non-empty array; `weekId` should be the **previous** ISO week (e.g. `2026W22` while current is `2026W23`).

**See the recap modal again** (same closed week):

```js
// Browser devtools console
localStorage.removeItem('panteon-recap-dismissed-week');
location.reload();
```

#### Option B — Full week-close pipeline (reset mechanics)

Use when you need to test **DISTRIBUTING → CLOSED → new ACTIVE** end-to-end. This **closes the current week early** (dev only).

```bash
npm run seed
npm run job:distribute    # closes week, writes rewards, opens new empty week
npm run seed              # repopulate the new current week
```

Refresh the app — recap modal + last week section should appear for the week that was just closed.

#### Option C — Outside top 100 (no prize in recap)

Open with:

`http://localhost:5173/?mockPlayer=8000`

Run Option A seed commands first. Recap should show **Outside top 100 — no prize this week** (no confetti).

#### Option D — Component-only (no backend)

```bash
npm run storybook -w client
```

Open **Premium / WeekRewardsPanel** for the reward list UI in isolation.

### What is _not_ shown

Last week’s **full live ranking** (podium scores for the closed week) is not archived — Redis keys are deleted on reset. The UI shows **prize distribution** (rank + amount + display name) from Postgres, which is the persisted source of truth after close.

---

## Scale testing (case reviewers — 2M DAU / 10M registered)

The case targets **10M+ registered** players and **~2M DAU**. That does **not** mean simulating 2M concurrent users on a laptop. Ranking uses Redis ZSET (`O(log N)`); ingest is batched on the game server ([docs/SCALE-INGEST.md](docs/SCALE-INGEST.md)).

### Quick proof (~3 minutes)

**Prerequisites:** API + Postgres + Redis + MongoDB running; [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed (`brew install k6`).

From the **monorepo root**:

```bash
npm run seed
npm run test:scale
```

This runs:

1. **Redis benchmark** — `ZREVRANK` / `ZREVRANGE` / `ZINCRBY` at current player count (default seed: 50K).
2. **k6 read load** — top 100, pool, personal rank (`demo-user` ~rank 76).
3. **k6 ingest** — internal score API (~30 events/s).

**Pass targets:** Redis rank p95 ≤ 10ms; API top p95 &lt; 250ms, `/me` p95 &lt; 350ms; ingest p95 &lt; 150ms.

```bash
SKIP_INGEST=1 npm run test:scale                    # read-only
BASE_URL=https://panteon-leaderboard-server-production.up.railway.app SKIP_INGEST=1 npm run test:scale   # live API
SEED_USER_COUNT=200000 npm run seed && npm run test:scale   # heavier local proof
```

Full tiers, traffic model, and troubleshooting: **[docs/SCALE-TESTING.md](docs/SCALE-TESTING.md)**.

---

## API

| Method | Path                         | Auth                 | Description                   |
| ------ | ---------------------------- | -------------------- | ----------------------------- |
| GET    | `/api/leaderboard/top`       | —                    | Top 100                       |
| GET    | `/api/leaderboard/me`        | JWT                  | Rank + neighborhood (3↑ / 2↓) |
| GET    | `/api/pool`                  | —                    | Prize pool                    |
| GET    | `/api/week/current`          | —                    | Active week                   |
| GET    | `/api/rewards/latest`        | —                    | Last closed week rewards      |
| GET    | `/api/rewards/:weekId`       | —                    | Week rewards                  |
| GET    | `/healthz`                   | —                    | Liveness                      |
| GET    | `/readyz`                    | —                    | DB readiness                  |
| POST   | `/api/internal/scores`       | `X-Internal-Api-Key` | Score ingest                  |
| POST   | `/api/internal/scores/batch` | `X-Internal-Api-Key` | Batch ingest                  |
| WS     | `/live?weekId=`              | —                    | Live updates                  |

---

## Scripts

```bash
# Root
npm run dev -w server          # API (port 3001)
npm run dev -w client          # Frontend (port 5173)
npm run build -w packages/shared && npm run build -w server
npm run build -w client
npm run test -w server         # Backend tests (26)
npm run test -w client         # Frontend tests (56)
npm run lint -w server
npm run lint -w client
npm run seed
npm run seed:closed-week   # Dev: seed previous closed week (Postgres only) for last-week UI
npm run job:distribute
npm run test:scale             # Case scale test (Redis bench + k6 read + ingest)
npm run benchmark:redis        # Redis O(log N) latency only
npm run load:case              # k6 read load (reviewer summary)
npm run load:k6                # Read smoke test
npm run load:k6:ingest         # Write smoke test
```

`npm run seed` and `seed:closed-week` must be run from the **monorepo root** (`panteon-leaderboard`). The separate `leaderboard-fe` deploy repo has no seed scripts — point the frontend at this backend or run the client workspace from the monorepo.

---

## Environment

See [.env.example](.env.example). Client uses `VITE_API_URL` and `VITE_WS_URL` (optional — defaults to same host in production).

---

## Deploy

- **Live frontend:** [https://panteon-leaderboard.netlify.app/](https://panteon-leaderboard.netlify.app/) — [leaderboard-fe](https://github.com/hamdidal/leaderboard-fe)
- **Live backend:** [https://panteon-leaderboard-server-production.up.railway.app](https://panteon-leaderboard-server-production.up.railway.app) — [leaderboard-be](https://github.com/hamdidal/leaderboard-be)
- **Data:** Neon (Postgres), Upstash (Redis), MongoDB Atlas

Set `CORS_ORIGINS` to include `https://panteon-leaderboard.netlify.app`.

---

## AI workflow

See [AI_WORKFLOW.md](AI_WORKFLOW.md).
