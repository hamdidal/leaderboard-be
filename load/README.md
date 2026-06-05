# Load testing

**Case reviewers:** start with the full guide in [docs/SCALE-TESTING.md](../docs/SCALE-TESTING.md) and run `npm run test:scale` from the monorepo root (Redis benchmark + k6 reads + k6 ingest).

Read-heavy smoke test for the case scenario (“leaderboard must load fast”, top 100 + personal rank).

## Prerequisites

- API running (`npm run dev -w server` or production build)
- Redis + Postgres up, data seeded (`npm run seed`)
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed locally

```bash
brew install k6   # macOS
```

## Run

```bash
# 1) API must be up on :3001 (only start if nothing is listening yet)
curl -s http://127.0.0.1:3001/healthz
# → {"status":"ok"}

# If you see EADDRINUSE when running `npm run dev -w server`, the API is
# already running — skip that step and go straight to seed + load:k6.

npm run seed
npm run test:scale
```

```bash
# Full case scale test (recommended for reviewers)
npm run test:scale

# Or individual steps
npm run benchmark:redis
npm run load:case

# Default: http://127.0.0.1:3001, demo-user JWT (API already running)
npm run load:k6

# Custom target / user
BASE_URL=https://api.example.com DEMO_USER_ID=demo-user npm run load:k6
```

## What it measures

| Endpoint                    | Role                             |
| --------------------------- | -------------------------------- |
| `GET /healthz`              | Setup guard                      |
| `POST /api/auth/demo-token` | JWT for `/me`                    |
| `GET /api/leaderboard/top`  | Top 100 (cached Redis → ~3s TTL) |
| `GET /api/pool`             | Prize pool                       |
| `GET /api/leaderboard/me`   | Rank + neighborhood              |

Ramp: 0 → 10 VUs over ~45s (tuned to stay under the API global **1000 req/min** rate limit). Thresholds: p95 top &lt; 250ms, me &lt; 350ms.

**Port 3001 already in use?** Your API is probably already running — skip `npm run dev -w server` and run `curl http://127.0.0.1:3001/healthz` then `npm run load:k6`.

If you see many `429` responses, lower VUs in `leaderboard-smoke.js` or temporarily raise `rateLimit.max` in `server/src/app.ts` for local benchmarking only.

This is **not** a full 2M DAU proof — it demonstrates O(log N) Redis reads stay fast under concurrent read load. For deeper scale evidence, increase `stages` in `k6/leaderboard-smoke.js` or run against a staged environment with production-like seed size (`SEED_USER_COUNT=50000`).

## Write-path ingest (`load:k6:ingest`)

Simulates the **game server** calling internal score ingest:

```bash
npm run seed
npm run load:k6:ingest
```

Uses `POST /api/internal/scores` with `X-Internal-Api-Key` (~30 events/s constant arrival). See [docs/SCALE-INGEST.md](../docs/SCALE-INGEST.md) for how this relates to 2M DAU (batching, queues, Redis sharding by week).
