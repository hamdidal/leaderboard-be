# AI Workflow Documentation

## Role of AI in this project

AI (Cursor / Claude) acted strictly as a **junior developer** for code production. All architecture, stack choices, data models, API contracts, distribution formula, and acceptance criteria were defined in the human-authored specification (`Development Prompt & Technical Specification`). The human engineer owns review and approval of every meaningful decision.

## Tools used

| Tool                    | Version / Model   | Tasks                                                                                                                                                      |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cursor (Agent mode)** | Claude Sonnet 4.5 | Monorepo scaffold, server modules, Redis ranking layer, Prisma schema, React component system, i18n/theme setup, Docker Compose, README, post-review fixes |
| **Human spec**          | —                 | Full system design, Redis key schema, reward algorithm, neighborhood window rules, deliverables checklist, code review                                     |

## Where AI accelerated work

- Boilerplate: Fastify plugin wiring, Prisma models, Zod shared schemas, TanStack Query hooks
- Repetitive layers: Redis repo methods (`ZREVRANGE`, `ZREVRANK`, pool at seed)
- Premium leaderboard UI (`LeaderboardLayout`, `PlayerRow`, `Podium`, sticky context panel)
- Storybook stories + fixtures for component catalog
- Test scaffold for distribution rounding invariant and client gap/tier helpers
- `docker-compose.yml`, Dockerfiles, GitHub Actions CI template

## Human-owned decisions (from spec, not invented by AI)

- Stateless architecture with Redis ZSET as ranking engine
- Stack: Fastify, PostgreSQL, MongoDB, Redis, BullMQ, React/Vite
- Prize pool: 2% collection; 20/15/10% top 3; ranks 4–100 weighted by `(101 - r)`
- Neighborhood: 3 above, 2 below when outside top 100
- Week ID format `2026W23`, Monday cron reset
- JWT auth (no session store); WebSocket via Redis Pub/Sub
- English-only codebase; i18n for UI with `en` + `tr`
- Storybook for reusable UI documentation (case / AI deliverable)

## Corrections during review

**Initial development review:**

- Neighborhood rank calculation simplified to `zeroStart + i + 1`
- Seed script: demo users placed at configurable ranks (default ~76, outside ~8000 via query param)
- FOUC prevention: inline theme script in `index.html` before React paint

**Post-delivery technical review (2026-06-04):**

- **DISTRIBUTING deadlock fixed:** crash recovery path added — DISTRIBUTING + no rewards resets to ACTIVE before re-acquiring the lock, preventing permanent prize blockage
- **Prize distribution batch INSERT:** `reward.create` loop inside transaction replaced with `reward.createMany` (single SQL statement)
- **N+1 upsert at distribution fixed:** `ensureUsersExist` now batches all missing users via a single Redis pipeline + `createMany(skipDuplicates)`
- **WebSocket fan-out O(N→O(k)):** replaced `websocketServer.clients.forEach` iteration with `Map<channel, Set<WebSocket>>` index
- **SHA-256 checksum:** replaced djb2 bitwise hash in `distributionChecksum` with `node:crypto` SHA-256
- **CORS restricted:** `origin: true` wildcard replaced with env-driven `CORS_ORIGINS` allowlist in production
- **JWT_SECRET minimum raised:** `min(8)` → `min(32)` per NIST HS256 recommendation
- **totalPlayers live from Redis:** removed hardcoded `10_000_000` constant; `getCurrentWeekMeta` now returns `ZCARD` result; shared schema updated
- **MongoDB:** `reward_audit` index on connect (weekly distribution idempotency)
- **Dead code removed:** unused Atomic Design tree (`organisms/`, legacy `templates/`, `LeaderboardScreen`, `mockData.ts`); single `premium/` UI path
- **UX:** `pointsToTop100`, `GlobalMetaBar` + tier i18n, jump-to-me (top 100 only), closed-week rewards panel, `me` error states
- **Scope trim:** public `POST /api/earnings` and dev earn simulator removed — demo driven by seed; pool at seed time
- **CI hardened:** removed `|| true` from both lint steps; added MongoDB service container to test job
- **Tests:** client `LeaderboardPage` integration + `leaderboard-case` E2E; unused shadcn UI + `mockAvatar` removed

## Sample prompts used

1. _"Build stateless leaderboard with Node.js + TypeScript + PostgreSQL + MongoDB + Redis per attached spec; separate client/server; English only."_
2. _"Scaffold monorepo and docker-compose first, then backend domain layer."_
3. _"Implement reward distribution exactly as specified with rounding remainder to rank 1."_

## Decision log

| Date       | Decision                                                                                          | Owner               |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| 2026-05-26 | Redis ZSET for O(log N) ranking                                                                   | Human (spec §4)     |
| 2026-05-26 | Fastify over Express — lower overhead, native TypeScript support                                  | Human (spec §3)     |
| 2026-05-26 | Monorepo with npm workspaces — shared Zod schemas between client and server                       | Human (spec §5)     |
| 2026-05-27 | Demo user outside top 100 via `?mockPlayer=8000`; default demo in top 100 (~70s)                  | Human               |
| 2026-05-27 | BullMQ over node-cron — job deduplication and retry semantics required                            | Human               |
| 2026-05-28 | MongoDB `reward_audit` for distribution idempotency                                               | Human               |
| 2026-05-28 | Spec asked for Atomic Design; shipped `premium/` feature folder + small atoms/molecules           | Human               |
| 2026-06-04 | Crash-recovery fix: DISTRIBUTING + 0 rewards → reset to ACTIVE before re-acquiring lock           | Human (post-review) |
| 2026-06-04 | SHA-256 for distribution checksum (replaced djb2 bitwise hash)                                    | Human (post-review) |
| 2026-06-04 | CORS_ORIGINS env var — restrict origins in production instead of wildcard                         | Human (post-review) |
| 2026-06-04 | No public earn API in leaderboard service; seed + read APIs for case demo                         | Human               |
| 2026-06-04 | Internal ingest `POST /api/internal/scores` + 2% pool + Pub/Sub; k6 write smoke + SCALE-INGEST.md | Human               |
