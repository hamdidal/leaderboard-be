import { faker } from '@faker-js/faker';
import { WeekStatus } from '@prisma/client';
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { displayNameForUserId } from '../lib/display-name';
import { RedisKeys } from '../lib/redis-keys';
import { getIsoWeekId, getPreviousIsoWeekId, getWeekBounds } from '../lib/week';
import { computeRewardAmounts } from '../modules/rewards/distribution';

config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const DEMO_USER_MAIN = 'demo-user';
const POOL_TOTAL = 1_250_000;

async function seedClosedWeek(): Promise<void> {
  const currentWeekId = (await redis.get(RedisKeys.currentWeek())) ?? getIsoWeekId();
  const closedWeekId = getPreviousIsoWeekId(currentWeekId);

  if (closedWeekId === currentWeekId) {
    throw new Error(`Could not derive a previous week from ${currentWeekId}`);
  }

  const { startsAt, endsAt } = getWeekBounds(closedWeekId);

  const rankedUserIds = Array.from({ length: 100 }, (_, i) => {
    const rank = i + 1;
    return rank === 76 ? DEMO_USER_MAIN : `closed-week-${closedWeekId}-rank-${rank}`;
  });

  const rewardMap = computeRewardAmounts(POOL_TOTAL, rankedUserIds);
  const entries: { rank: number; userId: string; amount: number }[] = [];
  for (const [rank, { userId, amount }] of rewardMap) {
    entries.push({ rank, userId, amount });
  }

  for (const entry of entries) {
    const displayName =
      entry.userId === DEMO_USER_MAIN ? 'Demo Hero' : displayNameForUserId(entry.userId);
    await prisma.user.upsert({
      where: { id: entry.userId },
      create: { id: entry.userId, displayName, avatarUrl: faker.image.avatar() },
      update: { displayName },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.week.upsert({
      where: { id: closedWeekId },
      create: {
        id: closedWeekId,
        startsAt,
        endsAt,
        status: WeekStatus.CLOSED,
        poolTotal: POOL_TOTAL,
      },
      update: {
        status: WeekStatus.CLOSED,
        poolTotal: POOL_TOTAL,
        startsAt,
        endsAt,
      },
    });

    await tx.reward.deleteMany({ where: { weekId: closedWeekId } });
    await tx.reward.createMany({
      data: entries.map((e) => ({
        weekId: closedWeekId,
        userId: e.userId,
        rank: e.rank,
        amount: e.amount,
      })),
    });
  });

  console.log(
    `Seeded closed week ${closedWeekId} (${entries.length} rewards, pool ${POOL_TOTAL}).`,
  );
  console.log(`Current active week unchanged: ${currentWeekId}`);
  console.log('Refresh the app — Week Rewards panel should appear at the bottom.');

  await prisma.$disconnect();
  await redis.quit();
}

seedClosedWeek().catch((e) => {
  console.error(e);
  process.exit(1);
});
