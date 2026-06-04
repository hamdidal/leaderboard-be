# leaderboard-be

Stateless weekly leaderboard API for idle/clicker games. Redis ZSET ranking, PostgreSQL persistence, MongoDB audit, BullMQ weekly prize distribution.

## Stack

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

## Structure

```
leaderboard-be/
├── server/           # Fastify API
├── packages/shared/  # Shared Zod schemas & types
├── load/k6/          # Load tests
├── docs/
└── .env.example
```

## Quick start

Prerequisites: Node.js 20+, PostgreSQL, MongoDB, Redis (local or managed).

```bash
cp .env.example .env
npm install
npm run build -w packages/shared
cd server && npx prisma migrate deploy && cd ..
npm run seed
npm run dev
```

- API: http://localhost:3001
- Health: http://localhost:3001/healthz
- OpenAPI: http://localhost:3001/docs

### Demo token (development only)

```bash
curl -X POST http://localhost:3001/api/auth/demo-token \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo-user"}'
```

Disabled when `NODE_ENV=production`.

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

## Scripts

```bash
npm run lint
npm run test
npm run build
npm run seed
npm run job:distribute
npm run load:k6
```

## Environment

See [.env.example](.env.example).

## Deploy

Railway / Render / Fly.io with managed Neon (Postgres), Upstash (Redis), MongoDB Atlas. Set `NODE_ENV=production`, strong `JWT_SECRET` and `INTERNAL_API_KEY`, and `CORS_ORIGINS` to your frontend URL.

## AI workflow

See [AI_WORKFLOW.md](AI_WORKFLOW.md).
