import { redis } from '../config/redis';
import { RedisKeys } from '../lib/redis-keys';

export type LeaderboardLiveEvent =
  | { type: 'rank_update'; userId: string }
  | { type: 'week_reset'; oldWeekId: string; newWeekId: string };

export async function publishLeaderboardLive(
  weekId: string,
  event: LeaderboardLiveEvent,
): Promise<void> {
  await redis.publish(RedisKeys.pubSubChannel(weekId), JSON.stringify(event));
}
