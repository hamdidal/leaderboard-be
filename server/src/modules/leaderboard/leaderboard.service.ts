import type {
  LeaderboardEntry,
  MeLeaderboardResponse,
  TopLeaderboardResponse,
} from '@panteon/shared';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/errors';
import { resolveDisplayName } from '../../lib/display-name';
import { getWeekBounds, secondsUntil } from '../../lib/week';
import { leaderboardRepo } from './leaderboard.repo';

export class LeaderboardService {
  private async enrichEntries(
    entries: Omit<LeaderboardEntry, 'name' | 'avatarUrl'>[],
  ): Promise<LeaderboardEntry[]> {
    if (entries.length === 0) return [];

    const userIds = entries.map((e) => e.userId);
    const [pgUsers, metaMap] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, avatarUrl: true },
      }),
      leaderboardRepo.getUsersMetaBatch(userIds),
    ]);

    const pgMap = new Map(pgUsers.map((u) => [u.id, u]));

    return entries.map((e) => {
      const pg = pgMap.get(e.userId);
      const meta = metaMap.get(e.userId);
      return {
        ...e,
        name: resolveDisplayName(e.userId, pg?.displayName, meta?.displayName),
        avatarUrl: pg?.avatarUrl ?? meta?.avatarUrl ?? null,
      };
    });
  }

  async getTop100(): Promise<TopLeaderboardResponse> {
    const weekId = await leaderboardRepo.getCurrentWeekId();
    const cached = await leaderboardRepo.getCachedTop100(weekId);

    if (cached) {
      return JSON.parse(cached) as TopLeaderboardResponse;
    }

    const members = await leaderboardRepo.getTop100(weekId);
    const base = leaderboardRepo.toEntries(members, 1);
    const entries = await this.enrichEntries(base);
    const response: TopLeaderboardResponse = { weekId, entries };

    await leaderboardRepo.cacheTop100(weekId, JSON.stringify(response), 3);
    return response;
  }

  async getMe(userId: string): Promise<MeLeaderboardResponse> {
    const weekId = await leaderboardRepo.getCurrentWeekId();
    const hood = await leaderboardRepo.getNeighborhood(weekId, userId);

    if (!hood) {
      throw new AppError('User not on leaderboard for current week', 404);
    }

    const inTop100 = hood.rank <= 100;
    const base = leaderboardRepo.neighborhoodToEntries(hood);
    const enriched = await this.enrichEntries(base);
    const me = enriched.find((e) => e.userId === userId);

    if (!me) {
      throw new AppError('User not on leaderboard for current week', 404);
    }

    const neighbors = enriched.filter((e) => e.userId !== userId);

    return { weekId, inTop100, me, neighbors };
  }

  async getCurrentWeekMeta() {
    const weekId = await leaderboardRepo.getCurrentWeekId();
    const { endsAt } = getWeekBounds(weekId);
    const [week, totalPlayers] = await Promise.all([
      prisma.week.findUnique({ where: { id: weekId } }),
      leaderboardRepo.getTotalPlayers(weekId),
    ]);
    return {
      weekId,
      startsAt: week?.startsAt.toISOString() ?? getWeekBounds(weekId).startsAt.toISOString(),
      endsAt: week?.endsAt.toISOString() ?? endsAt.toISOString(),
      status: week?.status ?? 'ACTIVE',
      secondsRemaining: secondsUntil(endsAt),
      totalPlayers,
    };
  }
}

export const leaderboardService = new LeaderboardService();
