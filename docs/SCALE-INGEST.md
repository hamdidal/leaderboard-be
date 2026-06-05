# Score ingest & scale (2M DAU intent)

This document explains how **heading 1** (runtime earnings, 2% pool, game-server integration) maps to industry practice for idle/clicker leaderboards at millions of DAU.

## Production data flow

```text
Mobile client → Game backend (authoritative) → Leaderboard service
                      │
                      ├─ batch / queue (Kafka, SQS, Redis stream)
                      └─ POST /api/internal/scores (service key)
```

Players must **not** call the ingest API directly. The game server validates currency, then forwards amounts.

## Why Redis ZINCRBY

- **O(log N)** per update for N players in the weekly ZSET.
- Single-key pipeline: `ZINCRBY` + `INCRBYFLOAT` (pool) + `DEL` (top-100 cache) + `PUBLISH` (live).
- Stateless API nodes; all state in Redis/Postgres/Mongo.

## 2% prize pool

`POOL_CONTRIBUTION_RATE` in `server/src/lib/redis-keys.ts` is applied on every accepted ingest:

`poolContribution = round(amount × 0.02, 2)`.

Seed still pre-fills historical totals; live week growth uses ingest.

## Idempotency

Mobile retries and duplicate queue deliveries are normal. Each ingest may include `idempotencyKey` (8–128 chars):

- **Redis** `SET idem:earn:{key} NX` with 7-day TTL — fast dedup on the hot path.
- **MongoDB** `earn_events` — append-only audit (sparse unique index on `idempotencyKey`).

## 2M DAU — what that implies

2M **daily active** does not mean 2M writes/second. Typical patterns:

| Pattern              | Approach                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| Frequent small earns | Client batches; game server flushes every N seconds                    |
| Burst traffic        | Queue + worker pool calling `/api/internal/scores/batch` (≤100 events) |
| Redis limits         | Shard by `weekId` (already isolated keys); scale reads with replicas   |
| Postgres             | Week metadata + rewards only; hot path avoids PG on ingest             |

**Proof in this repo:** `npm run test:scale` (Redis benchmark + k6 reads + k6 ingest). See [SCALE-TESTING.md](./SCALE-TESTING.md) for the full case-reviewer guide. These are **smoke benchmarks**, not a full 2M-player simulation — they show the chosen structures stay fast under concurrent load; optional heavier seeds use `SEED_USER_COUNT=200000` or `2000000`.

## API reference

| Method | Path                         | Auth                 |
| ------ | ---------------------------- | -------------------- |
| POST   | `/api/internal/scores`       | `X-Internal-Api-Key` |
| POST   | `/api/internal/scores/batch` | `X-Internal-Api-Key` |

Body (single): `{ "userId": "...", "amount": 100, "idempotencyKey?": "uuid" }`.

Rate limits: 5000/min single, 500/min batch (per route config).
