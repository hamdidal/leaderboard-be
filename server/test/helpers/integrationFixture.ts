import { WeekStatus } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { redis } from '../../src/config/redis';
import { RedisKeys } from '../../src/lib/redis-keys';
import { getIsoWeekId, getWeekBounds } from '../../src/lib/week';

export const TEST_WEEK_ID = '2099W99';

export const TEST_USER_IN_TOP = 'test-integration-in-top';
export const TEST_USER_OUTSIDE = 'test-integration-outside';

let previousCurrentWeek: string | null = null;

export async function seedIntegrationFixture(): Promise<void> {
  const { startsAt, endsAt } = getWeekBounds(TEST_WEEK_ID);

  previousCurrentWeek = await redis.get(RedisKeys.currentWeek());

  const lbKey = RedisKeys.weekLeaderboard(TEST_WEEK_ID);
  const poolKey = RedisKeys.weekPool(TEST_WEEK_ID);

  await redis.del(lbKey, poolKey, RedisKeys.top100Cache(TEST_WEEK_ID));

  const pipeline = redis.pipeline();
  for (let rank = 1; rank <= 110; rank++) {
    const id = rank <= 100 ? `test-user-${rank}` : `test-user-extra-${rank}`;
    pipeline.zadd(lbKey, 200_000 - rank * 500, id);
  }
  pipeline.zadd(lbKey, 195_000, TEST_USER_IN_TOP);
  pipeline.zadd(lbKey, 145_000, TEST_USER_OUTSIDE);

  await pipeline.exec();

  await redis.set(RedisKeys.currentWeek(), TEST_WEEK_ID);
  await redis.set(poolKey, '42000');

  await prisma.week.upsert({
    where: { id: TEST_WEEK_ID },
    create: {
      id: TEST_WEEK_ID,
      startsAt,
      endsAt,
      status: WeekStatus.ACTIVE,
      poolTotal: 42000,
    },
    update: { status: WeekStatus.ACTIVE, poolTotal: 42000 },
  });

  for (const u of [
    { id: TEST_USER_IN_TOP, displayName: 'Integration In Top' },
    { id: TEST_USER_OUTSIDE, displayName: 'Integration Outside' },
  ]) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, displayName: u.displayName },
      update: { displayName: u.displayName },
    });
    await redis.hset(RedisKeys.userMeta(u.id), {
      displayName: u.displayName,
      avatarUrl: '',
    });
  }
}

export async function cleanupIntegrationFixture(): Promise<void> {
  await redis.del(
    RedisKeys.weekLeaderboard(TEST_WEEK_ID),
    RedisKeys.weekPool(TEST_WEEK_ID),
    RedisKeys.top100Cache(TEST_WEEK_ID),
  );

  const restoreWeek =
    previousCurrentWeek && previousCurrentWeek !== TEST_WEEK_ID
      ? previousCurrentWeek
      : getIsoWeekId();
  await redis.set(RedisKeys.currentWeek(), restoreWeek);

  await prisma.week.deleteMany({ where: { id: TEST_WEEK_ID } }).catch(() => undefined);
}
