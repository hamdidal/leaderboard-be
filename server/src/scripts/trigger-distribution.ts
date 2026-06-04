import { config } from 'dotenv';
import { connectMongo } from '../config/mongo';
import { prisma } from '../config/prisma';
import { leaderboardRepo } from '../modules/leaderboard/leaderboard.repo';
import { rewardsService } from '../modules/rewards/rewards.service';

config();

async function main(): Promise<void> {
  await connectMongo();
  const weekId = await leaderboardRepo.getCurrentWeekId();
  console.log(`Triggering distribution for ${weekId}...`);
  const result = await rewardsService.distributeAndResetWeek(weekId);
  console.log(result);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
