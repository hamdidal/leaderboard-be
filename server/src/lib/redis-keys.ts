export const RedisKeys = {
  currentWeek: () => 'lb:current',
  weekLeaderboard: (weekId: string) => `lb:week:${weekId}`,
  weekPool: (weekId: string) => `pool:week:${weekId}`,
  userMeta: (userId: string) => `user:meta:${userId}`,
  top100Cache: (weekId: string) => `cache:top100:${weekId}`,
  pubSubChannel: (weekId: string) => `live:week:${weekId}`,
} as const;

export const POOL_CONTRIBUTION_RATE = 0.02;
export const TOP_LIMIT = 100;
export const NEIGHBOR_ABOVE = 3;
export const NEIGHBOR_BELOW = 2;
