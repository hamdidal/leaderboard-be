import { faker } from '@faker-js/faker';
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { getIsoWeekId, getWeekBounds } from '../lib/week';
import { RedisKeys } from '../lib/redis-keys';
import { generateDisplayName } from '../lib/display-name';
import { ensureUsersExist } from '../modules/users/user.service';

config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

const USER_COUNT = Math.max(
  100,
  Number.parseInt(process.env.SEED_USER_COUNT ?? '50000', 10) || 50_000,
);
const DEMO_USER_MAIN = 'demo-user';
const DEMO_USER_OUTSIDE = 'demo-user-8000';
const PG_USER_BATCH = Math.min(500, USER_COUNT);

async function upsertDemoUser(id: string, displayName: string, avatarUrl: string): Promise<void> {
  await redis.hset(RedisKeys.userMeta(id), { displayName, avatarUrl });
  await prisma.user.upsert({
    where: { id },
    create: { id, displayName, avatarUrl },
    update: { displayName, avatarUrl },
  });
}

async function seed(): Promise<void> {
  const weekId = getIsoWeekId();
  const { startsAt, endsAt } = getWeekBounds(weekId);

  console.log(`Seeding week ${weekId} with ${USER_COUNT} users...`);

  await prisma.week.upsert({
    where: { id: weekId },
    create: { id: weekId, startsAt, endsAt, status: 'ACTIVE', poolTotal: 0 },
    update: { status: 'ACTIVE' },
  });

  const lbKey = RedisKeys.weekLeaderboard(weekId);
  const poolKey = RedisKeys.weekPool(weekId);

  await redis.del(lbKey, poolKey);
  await redis.set(RedisKeys.currentWeek(), weekId);

  const pipeline = redis.pipeline();
  let poolTotal = 0;
  const metaBatch: { id: string; displayName: string; avatarUrl: string }[] = [];

  for (let i = 0; i < USER_COUNT; i++) {
    const id = faker.string.uuid();
    const displayName = faker.person.fullName();
    const score = Math.floor(Math.pow(Math.random(), 2) * 500000) + 100;

    pipeline.zadd(lbKey, score, id);
    poolTotal += score * 0.02;

    if (i < PG_USER_BATCH) {
      metaBatch.push({ id, displayName, avatarUrl: faker.image.avatar() });
      pipeline.hset(RedisKeys.userMeta(id), {
        displayName,
        avatarUrl: faker.image.avatar(),
      });
    }
  }

  await pipeline.exec();

  for (const u of metaBatch) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl },
      update: { displayName: u.displayName },
    });
  }

  const rank72Raw = await redis.zrevrange(lbKey, 71, 71, 'WITHSCORES');
  const rank78Raw = await redis.zrevrange(lbKey, 77, 77, 'WITHSCORES');
  const mainScore =
    rank72Raw.length >= 2 && rank78Raw.length >= 2
      ? (parseFloat(rank72Raw[1]) + parseFloat(rank78Raw[1])) / 2
      : parseFloat(rank72Raw[1] ?? '5000') - 1;
  await redis.zadd(lbKey, mainScore, DEMO_USER_MAIN);

  const rank8000Raw = await redis.zrevrange(lbKey, 7999, 7999, 'WITHSCORES');
  const outsideScore = rank8000Raw.length >= 2 ? parseFloat(rank8000Raw[1]) - 1 : 1000;
  await redis.zadd(lbKey, outsideScore, DEMO_USER_OUTSIDE);

  const mainName = generateDisplayName();
  const mainAvatar = faker.image.avatar();
  const outsideName = generateDisplayName();
  const outsideAvatar = faker.image.avatar();
  await upsertDemoUser(DEMO_USER_MAIN, mainName, mainAvatar);
  await upsertDemoUser(DEMO_USER_OUTSIDE, outsideName, outsideAvatar);

  const top100Ids = await redis.zrevrange(lbKey, 0, 99);
  await ensureUsersExist(top100Ids);

  await redis.set(poolKey, String(poolTotal));

  const mainRank = (await redis.zrevrank(lbKey, DEMO_USER_MAIN)) ?? -1;
  const outsideRank = (await redis.zrevrank(lbKey, DEMO_USER_OUTSIDE)) ?? -1;

  console.log('Seed complete.');
  console.log(`Demo (default): ${DEMO_USER_MAIN} — rank ${mainRank + 1}`);
  console.log(`Demo (outside): ${DEMO_USER_OUTSIDE} — rank ${outsideRank + 1}`);
  console.log('Client: ?mockPlayer=8000 for outside-top-100 panel demo');
  console.log(`Get token: POST /api/auth/demo-token { "userId": "${DEMO_USER_MAIN}" }`);

  await prisma.$disconnect();
  await redis.quit();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
