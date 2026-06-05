# Scale testing — case reviewer guide

Muscle Land targets **10M+ registered players** and **~2M daily active users (DAU)**. This guide explains what that means for testing and how to verify the implementation in a few minutes.

## What the case is (and is not) asking

| Term                 | Meaning                                        | How we test it                                                                                                              |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **10M registered**   | Total accounts over the product lifetime       | Not all 10M appear in the weekly Redis ranking; Postgres holds persistent users, Redis holds **this week’s active scorers** |
| **~2M DAU**          | Players who play on a given day                | Does **not** mean 2M concurrent API calls or 2M writes/second                                                               |
| **Fast leaderboard** | Top 100 + personal rank/neighbors feel instant | Redis ZSET `O(log N)` + 3s top-100 cache + k6 read smoke                                                                    |

Typical idle/clicker pattern at 2M DAU:

- Clients batch small earns; the **game server** flushes to `POST /api/internal/scores` or `/batch` (see [SCALE-INGEST.md](./SCALE-INGEST.md)).
- Leaderboard **reads** peak at tens of req/s, not millions.
- Hot path avoids Postgres on ingest; week keys are isolated by `weekId`.

**You do not need** to simulate 2M simultaneous users or seed 10M rows on a laptop. The repo provides a **layered proof**: algorithm (O(log N)), Redis latency at realistic N, and API load under concurrent reads + ingest.

---

## Quick path (recommended, ~3 minutes)

**Prerequisites:** Node 20+, PostgreSQL, MongoDB, Redis, [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).

```bash
cp .env.example .env
npm install --legacy-peer-deps
npm run build -w packages/shared
cd server && npx prisma migrate deploy && cd ..

# Terminal 1 — API
npm run dev -w server

# Terminal 2 — seed + full case scale test (monorepo root)
npm run seed
npm run test:scale
```

`npm run test:scale` runs three steps:

1. **Redis benchmark** — `ZREVRANK`, `ZREVRANGE`, `ZINCRBY` at current ZSET size (default seed: 50K players).
2. **k6 read load** — `GET /api/leaderboard/top`, `/pool`, `/me` (10 VUs, ~1 min).
3. **k6 ingest load** — `POST /api/internal/scores` (~30 events/s, 45s).

### Pass criteria (local / staging)

| Step      | Metric                                 | Target  |
| --------- | -------------------------------------- | ------- |
| Redis     | `ZREVRANK` p95 (rank #1, ~N/2, ~N)     | ≤ 10ms  |
| Redis     | `ZREVRANGE` top 100 / neighborhood p95 | ≤ 15ms  |
| Redis     | `ZINCRBY` p95                          | ≤ 10ms  |
| k6 reads  | `http_req_failed`                      | < 5%    |
| k6 reads  | p95 `GET /api/leaderboard/top`         | < 250ms |
| k6 reads  | p95 `GET /api/leaderboard/me`          | < 350ms |
| k6 ingest | p95 `POST /api/internal/scores`        | < 150ms |

WARN on Redis usually means slow local Docker Redis or laptop thermal throttling — compare relative numbers before/after a larger seed.

### Skip ingest (read-only check)

```bash
SKIP_INGEST=1 npm run test:scale
```

### Test production API (read-only benchmark against live)

```bash
BASE_URL=https://panteon-leaderboard-server-production.up.railway.app SKIP_INGEST=1 npm run test:scale
```

Production is seeded with ~50K players — enough to show rank queries stay fast at case scale.

---

## Individual commands

```bash
npm run benchmark:redis    # Redis hot-path latency only
npm run load:case          # k6 read scenario (case summary output)
npm run load:k6            # k6 read smoke (same family, minimal output)
npm run load:k6:ingest     # k6 write ingest only
```

Environment:

| Variable               | Default                 | Purpose                                    |
| ---------------------- | ----------------------- | ------------------------------------------ |
| `BASE_URL`             | `http://127.0.0.1:3001` | API target for k6                          |
| `SEED_USER_COUNT`      | `50000`                 | Players in Redis ZSET                      |
| `BENCHMARK_ITERATIONS` | `200`                   | Redis benchmark sample size                |
| `SKIP_INGEST`          | `0`                     | Set `1` in `test:scale` to skip write load |

---

## Scale tiers (optional, heavier proof)

Use when you want to demonstrate latency stability as **N** grows.

### Tier A — Default (50K) — case minimum

```bash
npm run seed
npm run test:scale
```

Matches production demo. `log₂(50_000) ≈ 15.6`.

### Tier B — Medium (200K) — strong local proof

```bash
SEED_USER_COUNT=200000 npm run seed   # several minutes, ~200MB Redis
npm run test:scale
```

`log₂(200_000) ≈ 17.6` — only ~2 more tree levels than 50K; p95 should stay in the same ballpark.

### Tier C — Large (2M) — staging / cloud only

```bash
SEED_USER_COUNT=2000000 npm run seed  # 30+ min, ~300MB–1GB Redis RAM
npm run test:scale
```

Run on Railway + Upstash (or a beefy VM). `log₂(2_000_000) ≈ 20.9`.

### Tier D — 10M registered (architecture note)

10M **registered** users do not require a 10M-member weekly ZSET. Weekly active players are the relevant **N** for ranking. A 2M-member ZSET already exercises the same code paths as 10M for `O(log N)` (difference: ~3 log steps). Document this in review — see table below.

| N (weekly active) | log₂(N) | Typical Redis ZREVRANK      |
| ----------------- | ------- | --------------------------- |
| 50K               | 15.6    | sub-ms – low ms             |
| 200K              | 17.6    | sub-ms – low ms             |
| 2M                | 20.9    | low ms                      |
| 10M               | 23.3    | still low ms (≈ +2.4 vs 2M) |

---

## 2M DAU traffic model (why k6 uses 10 VUs)

Back-of-envelope for reviewer narrative:

| Assumption                         | Estimate                                               |
| ---------------------------------- | ------------------------------------------------------ |
| 2M DAU                             | —                                                      |
| 10% open leaderboard/day           | 200K page loads                                        |
| Spread over 24h                    | ~2.3 req/s average                                     |
| Peak multiplier (10–20×)           | **25–50 req/s** read peak                              |
| Earn events batched on game server | **hundreds–low thousands events/s** at peak (not 2M/s) |

The bundled k6 scripts intentionally stay at **10 VUs / ~30 ingest events/s** so they pass the API’s default rate limit (1000 req/min global) on a developer machine. For higher RPS experiments, raise `rateLimit.max` in `server/src/app.ts` **locally only** and extend stages in `load/k6/leaderboard-case.js`.

---

## Troubleshooting

| Symptom                          | Fix                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `API not healthy`                | `npm run dev -w server`, check `curl http://127.0.0.1:3001/healthz`                |
| `totalPlayers < 100`             | `npm run seed` from monorepo root                                                  |
| Many `429` in k6                 | Lower VUs in `load/k6/leaderboard-case.js` or temporarily raise rate limit locally |
| `k6 not installed`               | `brew install k6` (macOS)                                                          |
| Redis benchmark `No active week` | Redis empty — run seed                                                             |
| Seed slow at 200K+               | Expected; use Tier B/C on a machine with enough RAM                                |

---

## What reviewers should conclude

1. **Data structure** — Weekly leaderboard is a Redis ZSET; rank/neighbor/top-100 are `O(log N)` or `O(log N + k)`.
2. **Measured** — At 50K–200K (and optionally 2M) members, Redis and API latencies meet the thresholds above.
3. **Ingest** — Writes go through internal API with idempotency; 2M DAU is handled via batching/queues on the game-server side ([SCALE-INGEST.md](./SCALE-INGEST.md)).
4. **Not required** — Full 2M concurrent WebSocket fan-out or 10M-row laptop seed.

---

## Related docs

- [SCALE-INGEST.md](./SCALE-INGEST.md) — game-server flow, batching, idempotency
- [load/README.md](../load/README.md) — k6 script details
- [README.md](../README.md) — UI demo scenarios (top 100 vs outside top 100)
