import { config } from 'dotenv';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

config({ path: path.resolve(__dirname, '../.env') });

import { buildApp } from '../src/app';
import { connectMongo } from '../src/config/mongo';
import { env } from '../src/config/env';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import {
  cleanupIntegrationFixture,
  seedIntegrationFixture,
  TEST_USER_IN_TOP,
  TEST_USER_OUTSIDE,
  TEST_WEEK_ID,
} from './helpers/integrationFixture';

async function infraAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    return false;
  }
  try {
    await redis.ping();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const infraUp = await infraAvailable();

describe.skipIf(!infraUp)('API routes (Fastify inject)', () => {
  let app: FastifyInstance;
  let tokenInTop: string;

  beforeAll(async () => {
    await connectMongo();
    await seedIntegrationFixture();
    app = await buildApp();
    await app.ready();

    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-token',
      payload: { userId: TEST_USER_IN_TOP },
    });
    tokenInTop = tokenRes.json().token;
  });

  afterAll(async () => {
    await app.close();
    await cleanupIntegrationFixture();
    await prisma.$disconnect();
  });

  it('GET /healthz returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/leaderboard/top returns 100 entries for test week', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leaderboard/top' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.weekId).toBe(TEST_WEEK_ID);
    expect(body.entries).toHaveLength(100);
    expect(body.entries[0].rank).toBe(1);
  });

  it('GET /api/pool and /api/week/current', async () => {
    const pool = await app.inject({ method: 'GET', url: '/api/pool' });
    expect(pool.statusCode).toBe(200);
    expect(pool.json().weekId).toBe(TEST_WEEK_ID);
    expect(pool.json().poolTotal).toBeGreaterThan(0);

    const week = await app.inject({ method: 'GET', url: '/api/week/current' });
    expect(week.statusCode).toBe(200);
    expect(week.json().weekId).toBe(TEST_WEEK_ID);
    expect(week.json().status).toBe('ACTIVE');
  });

  it('POST /api/internal/scores rejects missing API key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/scores',
      headers: { 'content-type': 'application/json' },
      payload: { userId: TEST_USER_IN_TOP, amount: 10 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/internal/scores accepts valid internal key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/internal/scores',
      headers: {
        'x-internal-api-key': env.INTERNAL_API_KEY,
        'content-type': 'application/json',
      },
      payload: { userId: TEST_USER_IN_TOP, amount: 40 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().accepted).toBe(true);
    expect(res.json().poolContribution).toBe(0.8);
  });

  it('GET /api/rewards/latest returns 200 with empty or closed payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rewards/latest' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      rewards: expect.any(Array),
    });
  });

  it('GET /api/leaderboard/me requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leaderboard/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/leaderboard/me returns in-top-100 player with neighbors', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/me',
      headers: { authorization: `Bearer ${tokenInTop}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weekId).toBe(TEST_WEEK_ID);
    expect(body.inTop100).toBe(true);
    expect(body.me.userId).toBe(TEST_USER_IN_TOP);
    expect(body.neighbors.length).toBeGreaterThan(0);
    expect(body.neighbors.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/leaderboard/me for outside-top-100 includes neighborhood', async () => {
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/auth/demo-token',
      payload: { userId: TEST_USER_OUTSIDE },
    });
    const token = tokenRes.json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.inTop100).toBe(false);
    expect(body.me.rank).toBeGreaterThan(100);
    expect(body.neighbors.length).toBeGreaterThanOrEqual(3);
    const ranks = [body.me, ...body.neighbors].map((e: { rank: number }) => e.rank);
    expect(Math.max(...ranks) - Math.min(...ranks)).toBeLessThanOrEqual(5);
  });
});
