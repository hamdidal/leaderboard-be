import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';
import { leaderboardRepo } from '../modules/leaderboard/leaderboard.repo';
import { rewardsService } from '../modules/rewards/rewards.service';

const connection = { url: env.REDIS_URL };

export const weeklyResetQueue = new Queue('weekly-reset', { connection });

export function startWeeklyResetWorker(): Worker {
  const worker = new Worker(
    'weekly-reset',
    async (job) => {
      const weekId =
        (job.data as { weekId?: string }).weekId ?? (await leaderboardRepo.getCurrentWeekId());
      return rewardsService.distributeAndResetWeek(weekId);
    },
    { connection },
  );

  worker.on('completed', (job, result) => {
    console.log(`Weekly reset job ${job.id} completed`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`Weekly reset job ${job?.id} failed`, err);
  });

  return worker;
}

export async function scheduleWeeklyReset(cronPattern: string): Promise<void> {
  await weeklyResetQueue.add(
    'distribute',
    {},
    {
      repeat: { pattern: cronPattern },
      jobId: 'weekly-distribute-cron',
    },
  );
}
