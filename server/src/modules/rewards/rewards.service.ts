import { WeekStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { getMongoDb } from '../../config/mongo';
import { getNextIsoWeekId, getWeekBounds } from '../../lib/week';
import { leaderboardRepo } from '../leaderboard/leaderboard.repo';
import { ensureUsersExist } from '../users/user.service';
import { publishLeaderboardLive } from '../../realtime/publish';
import { computeRewardAmounts, distributionChecksum } from './distribution';

export class RewardsService {
  async getRewardsForWeek(weekId: string) {
    const rewards = await prisma.reward.findMany({
      where: { weekId },
      orderBy: { rank: 'asc' },
      include: { user: { select: { displayName: true } } },
    });
    return rewards.map((r) => ({
      rank: r.rank,
      userId: r.userId,
      amount: Number(r.amount),
      displayName: r.user.displayName,
    }));
  }

  async getLatestClosedRewards(): Promise<{
    weekId: string;
    poolTotal: number;
    rewards: { rank: number; userId: string; amount: number; displayName?: string }[];
  } | null> {
    const week = await prisma.week.findFirst({
      where: { status: WeekStatus.CLOSED },
      orderBy: { endsAt: 'desc' },
    });
    if (!week) return null;

    const rewards = await this.getRewardsForWeek(week.id);
    if (rewards.length === 0) return null;

    return {
      weekId: week.id,
      poolTotal: Number(week.poolTotal),
      rewards,
    };
  }

  async distributeAndResetWeek(
    weekId: string,
  ): Promise<{ distributed: boolean; reason?: string; newWeekId?: string }> {
    const week = await prisma.week.findUnique({ where: { id: weekId } });
    if (!week) {
      return { distributed: false, reason: 'Week not found' };
    }

    if (week.status === WeekStatus.CLOSED) {
      return { distributed: false, reason: 'Already processed' };
    }

    const existingRewards = await prisma.reward.count({ where: { weekId } });
    if (existingRewards > 0) {
      return { distributed: false, reason: 'Rewards already distributed for this week' };
    }

    if (week.status === WeekStatus.DISTRIBUTING) {
      await prisma.week.updateMany({
        where: { id: weekId, status: WeekStatus.DISTRIBUTING },
        data: { status: WeekStatus.ACTIVE },
      });
    }

    const lockResult = await prisma.week.updateMany({
      where: { id: weekId, status: WeekStatus.ACTIVE },
      data: { status: WeekStatus.DISTRIBUTING },
    });

    if (lockResult.count === 0) {
      return { distributed: false, reason: 'Could not acquire distribution lock' };
    }

    try {
      const topUserIds = await leaderboardRepo.getTop100UserIds(weekId);
      await ensureUsersExist(topUserIds);

      const poolTotal = await leaderboardRepo.getPoolTotal(weekId);
      const rewardMap = computeRewardAmounts(poolTotal, topUserIds);

      const entries: { userId: string; rank: number; amount: number }[] = [];
      for (const [rank, { userId, amount }] of rewardMap) {
        entries.push({ userId, rank, amount });
      }

      await prisma.$transaction(async (tx) => {
        await tx.reward.createMany({
          data: entries.map((e) => ({ weekId, ...e })),
        });

        await tx.week.update({
          where: { id: weekId },
          data: { status: WeekStatus.CLOSED, poolTotal },
        });
      });

      const checksum = distributionChecksum(weekId, entries, poolTotal);
      const db = getMongoDb();
      await db.collection('reward_audit').insertOne({
        weekId,
        distributedAt: new Date(),
        poolTotal,
        entries,
        checksum,
      });

      const newWeekId = getNextIsoWeekId(weekId);
      const { startsAt, endsAt } = getWeekBounds(newWeekId);

      await prisma.week.upsert({
        where: { id: newWeekId },
        create: {
          id: newWeekId,
          startsAt,
          endsAt,
          status: WeekStatus.ACTIVE,
          poolTotal: 0,
        },
        update: { status: WeekStatus.ACTIVE },
      });

      await leaderboardRepo.setCurrentWeekId(newWeekId);
      await leaderboardRepo.resetWeekKeys(weekId);

      const resetEvent = {
        type: 'week_reset' as const,
        oldWeekId: weekId,
        newWeekId,
      };
      await Promise.all([
        publishLeaderboardLive(weekId, resetEvent),
        publishLeaderboardLive(newWeekId, resetEvent),
      ]);

      return { distributed: true, newWeekId };
    } catch (error) {
      const rewardCount = await prisma.reward.count({ where: { weekId } });
      if (rewardCount === 0) {
        await prisma.week.update({
          where: { id: weekId },
          data: { status: WeekStatus.ACTIVE },
        });
      }
      throw error;
    }
  }
}

export const rewardsService = new RewardsService();
