import { buildApp } from './app';
import { env } from './config/env';
import { connectMongo } from './config/mongo';
import { prisma } from './config/prisma';
import { redis } from './config/redis';
import { startWeeklyResetWorker, scheduleWeeklyReset } from './jobs/weekly-reset.worker';
import { getIsoWeekId, getWeekBounds } from './lib/week';
import { leaderboardRepo } from './modules/leaderboard/leaderboard.repo';
import { WeekStatus } from '@prisma/client';

async function ensureActiveWeek(): Promise<void> {
  const weekId = getIsoWeekId();
  const { startsAt, endsAt } = getWeekBounds(weekId);

  await prisma.week.upsert({
    where: { id: weekId },
    create: {
      id: weekId,
      startsAt,
      endsAt,
      status: WeekStatus.ACTIVE,
      poolTotal: 0,
    },
    update: {},
  });

  const current = await redis.get('lb:current');
  if (!current) {
    await leaderboardRepo.setCurrentWeekId(weekId);
  }
}

async function main(): Promise<void> {
  await connectMongo();
  await ensureActiveWeek();

  startWeeklyResetWorker();
  await scheduleWeeklyReset(env.WEEKLY_CRON);

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  console.log(`Server listening on ${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
