# leaderboard-be

Stateless weekly leaderboard API for **Muscle Land** — idle/clicker games. Redis ZSET ranking, PostgreSQL persistence, MongoDB audit, BullMQ weekly prize distribution.

## Live (production)

| | URL |
| --- | --- |
| **API base** | [https://panteon-leaderboard-server-production.up.railway.app](https://panteon-leaderboard-server-production.up.railway.app) |
| **Current week** | [GET /api/week/current](https://panteon-leaderboard-server-production.up.railway.app/api/week/current) |
| **Top 100** | [GET /api/leaderboard/top](https://panteon-leaderboard-server-production.up.railway.app/api/leaderboard/top) |
| **Health** | [GET /healthz](https://panteon-leaderboard-server-production.up.railway.app/healthz) |
| **OpenAPI** | [/docs](https://panteon-leaderboard-server-production.up.railway.app/docs) |
| **Frontend** | [https://panteon-leaderboard.netlify.app/](https://panteon-leaderboard.netlify.app/) |

Production is seeded (~50K players). Set `CORS_ORIGINS` to `https://panteon-leaderboard.netlify.app`.

## Repositories

| Repo | URL |
| ---- | --- |
| **Backend (this repo)** | [github.com/hamdidal/leaderboard-be](https://github.com/hamdidal/leaderboard-be) |
| **Frontend** | [github.com/hamdidal/leaderboard-fe](https://github.com/hamdidal/leaderboard-fe) |

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
- Readiness: http://localhost:3001/readyz
- OpenAPI: http://localhost:3001/docs

### Demo players (after seed)

| User ID | Approx. rank | Use case |
| ------- | ------------ | -------- |
| `demo-user` | ~76 | Inside top 100 |
| `demo-user-8000` | ~8000 | Outside top 100 (3↑ / 2↓ neighbors via `/api/leaderboard/me`) |

### Demo token (development only)

```bash
curl -X POST http://localhost:3001/api/auth/demo-token \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo-user"}'
```

Disabled when `NODE_ENV=production` (unless `DISABLE_DEMO_AUTH=false`).

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
npm run test          # 26 tests
npm run build
npm run seed
npm run job:distribute
npm run load:k6
npm run load:k6:ingest
```

## Environment

See [.env.example](.env.example). Production requires `JWT_SECRET`, `INTERNAL_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `MONGODB_URI`, and `CORS_ORIGINS`.

## Deploy

Hosted on **Railway** (`railway.toml`, `nixpacks.toml`). Data: Neon (Postgres), Upstash (Redis), MongoDB Atlas.

After deploy, run `npm run seed` once against production databases (or Railway one-off) so the live frontend has sample data.

## AI workflow

See [AI_WORKFLOW.md](AI_WORKFLOW.md) — covers both backend and frontend; AI-assisted development is part of the Panteon case deliverable.
