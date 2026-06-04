import { config } from 'dotenv';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

config({ path: path.resolve(__dirname, '../.env') });

import { connectMongo } from '../src/config/mongo';
import { prisma } from '../src/config/prisma';
import { redis } from '../src/config/redis';
import { RedisKeys } from '../src/lib/redis-keys';
import { scoreIngestService } from '../src/modules/ingest/score-ingest.service';
import {
  cleanupIntegrationFixture,
  seedIntegrationFixture,
  TEST_USER_IN_TOP,
  TEST_WEEK_ID,
} from './helpers/integrationFixture';

async function infraAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await redis.ping();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const infraUp = await infraAvailable();

describe.skipIf(!infraUp)('Score ingest service (Redis)', () => {
  beforeAll(async () => {
    await connectMongo();
    await seedIntegrationFixture();
  });

  afterAll(async () => {
    await cleanupIntegrationFixture();
    await prisma.$disconnect();
  });

  it('increments score and pool by 2%', async () => {
    const poolBefore = parseFloat((await redis.get(RedisKeys.weekPool(TEST_WEEK_ID))) ?? '0');
    const scoreBefore = parseFloat(
      (await redis.zscore(RedisKeys.weekLeaderboard(TEST_WEEK_ID), TEST_USER_IN_TOP)) ?? '0',
    );

    const result = await scoreIngestService.ingestOne({
      userId: TEST_USER_IN_TOP,
      amount: 500,
    });

    expect(result.accepted).toBe(true);
    expect(result.poolContribution).toBe(10);
    expect(result.score).toBe(scoreBefore + 500);

    const poolAfter = parseFloat((await redis.get(RedisKeys.weekPool(TEST_WEEK_ID))) ?? '0');
    expect(poolAfter).toBe(poolBefore + 10);
  });

  it('deduplicates by idempotency key', async () => {
    const idem = `redis-test-dup-${Date.now()}`;
    const first = await scoreIngestService.ingestOne({
      userId: TEST_USER_IN_TOP,
      amount: 100,
      idempotencyKey: idem,
    });
    expect(first.accepted).toBe(true);

    const second = await scoreIngestService.ingestOne({
      userId: TEST_USER_IN_TOP,
      amount: 900,
      idempotencyKey: idem,
    });
    expect(second.duplicate).toBe(true);
    expect(second.accepted).toBe(false);
  });
});
