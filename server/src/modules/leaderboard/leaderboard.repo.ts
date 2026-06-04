import type { LeaderboardEntry } from '@panteon/shared';
import { displayNameForUserId } from '../../lib/display-name';
import { redis } from '../../config/redis';
import { NEIGHBOR_ABOVE, NEIGHBOR_BELOW, RedisKeys, TOP_LIMIT } from '../../lib/redis-keys';

type ZsetMember = { member: string; score: string };

export class LeaderboardRepo {
  async getCurrentWeekId(): Promise<string> {
    const weekId = await redis.get(RedisKeys.currentWeek());
    if (!weekId) {
      throw new Error('No active week configured in Redis');
    }
    return weekId;
  }

  async setCurrentWeekId(weekId: string): Promise<void> {
    await redis.set(RedisKeys.currentWeek(), weekId);
  }

  private lbKey(weekId: string): string {
    return RedisKeys.weekLeaderboard(weekId);
  }

  async getRank(weekId: string, userId: string): Promise<number | null> {
    const rank = await redis.zrevrank(this.lbKey(weekId), userId);
    if (rank === null) return null;
    return rank + 1;
  }

  async getTop100(weekId: string): Promise<ZsetMember[]> {
    const raw = await redis.zrevrange(this.lbKey(weekId), 0, TOP_LIMIT - 1, 'WITHSCORES');
    const result: ZsetMember[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ member: raw[i], score: raw[i + 1] });
    }
    return result;
  }

  async getNeighborhood(
    weekId: string,
    userId: string,
  ): Promise<{
    rank: number;
    members: ZsetMember[];
  } | null> {
    const zeroRank = await redis.zrevrank(this.lbKey(weekId), userId);
    if (zeroRank === null) return null;

    const rank = zeroRank + 1;
    const start = Math.max(0, zeroRank - NEIGHBOR_ABOVE);
    const end = zeroRank + NEIGHBOR_BELOW;

    const raw = await redis.zrevrange(this.lbKey(weekId), start, end, 'WITHSCORES');
    const members: ZsetMember[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      members.push({ member: raw[i], score: raw[i + 1] });
    }

    return { rank, members };
  }

  async getTop100UserIds(weekId: string): Promise<string[]> {
    return redis.zrevrange(this.lbKey(weekId), 0, TOP_LIMIT - 1);
  }

  async getTotalPlayers(weekId: string): Promise<number> {
    return redis.zcard(this.lbKey(weekId));
  }

  async getPoolTotal(weekId: string): Promise<number> {
    const val = await redis.get(RedisKeys.weekPool(weekId));
    return val ? parseFloat(val) : 0;
  }

  async cacheTop100(weekId: string, data: string, ttlSeconds = 3): Promise<void> {
    await redis.setex(RedisKeys.top100Cache(weekId), ttlSeconds, data);
  }

  async getCachedTop100(weekId: string): Promise<string | null> {
    return redis.get(RedisKeys.top100Cache(weekId));
  }

  async setUserMeta(userId: string, displayName: string, avatarUrl?: string | null): Promise<void> {
    const key = RedisKeys.userMeta(userId);
    await redis.hset(key, {
      displayName,
      avatarUrl: avatarUrl ?? '',
    });
  }

  async getUserMeta(userId: string): Promise<{ displayName: string; avatarUrl: string | null }> {
    const data = await redis.hgetall(RedisKeys.userMeta(userId));
    if (data.displayName) {
      return {
        displayName: data.displayName,
        avatarUrl: data.avatarUrl || null,
      };
    }
    return { displayName: displayNameForUserId(userId), avatarUrl: null };
  }

  async getUsersMetaBatch(
    userIds: string[],
  ): Promise<Map<string, { displayName: string; avatarUrl: string | null }>> {
    const result = new Map<string, { displayName: string; avatarUrl: string | null }>();
    if (userIds.length === 0) return result;

    const pipeline = redis.pipeline();
    for (const id of userIds) {
      pipeline.hgetall(RedisKeys.userMeta(id));
    }
    const responses = await pipeline.exec();

    userIds.forEach((userId, i) => {
      const row = responses?.[i]?.[1] as Record<string, string> | undefined;
      if (row?.displayName) {
        result.set(userId, {
          displayName: row.displayName,
          avatarUrl: row.avatarUrl || null,
        });
      } else {
        result.set(userId, {
          displayName: displayNameForUserId(userId),
          avatarUrl: null,
        });
      }
    });

    return result;
  }

  async resetWeekKeys(oldWeekId: string): Promise<void> {
    await redis.del(
      this.lbKey(oldWeekId),
      RedisKeys.weekPool(oldWeekId),
      RedisKeys.top100Cache(oldWeekId),
    );
  }

  toEntries(members: ZsetMember[], startRank: number): LeaderboardEntry[] {
    return members.map((m, i) => ({
      rank: startRank + i,
      userId: m.member,
      name: '',
      score: parseFloat(m.score),
    }));
  }

  neighborhoodToEntries(hood: {
    rank: number;
    members: ZsetMember[];
  }): Omit<LeaderboardEntry, 'name' | 'avatarUrl'>[] {
    const zeroStart = Math.max(0, hood.rank - 1 - NEIGHBOR_ABOVE);
    return hood.members.map((m, i) => ({
      rank: zeroStart + i + 1,
      userId: m.member,
      score: parseFloat(m.score),
    }));
  }
}

export const leaderboardRepo = new LeaderboardRepo();
