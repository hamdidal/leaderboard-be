import { z } from 'zod';

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  name: z.string(),
  score: z.number(),
  avatarUrl: z.string().nullable().optional(),
});

export const topLeaderboardResponseSchema = z.object({
  weekId: z.string(),
  entries: z.array(leaderboardEntrySchema),
});

export const meLeaderboardResponseSchema = z.object({
  weekId: z.string(),
  inTop100: z.boolean(),
  me: leaderboardEntrySchema,
  neighbors: z.array(leaderboardEntrySchema).min(0).max(6),
});

export const poolResponseSchema = z.object({
  weekId: z.string(),
  poolTotal: z.number(),
});

export const weekCurrentResponseSchema = z.object({
  weekId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(['ACTIVE', 'DISTRIBUTING', 'CLOSED']),
  secondsRemaining: z.number(),
  totalPlayers: z.number().int().nonnegative(),
});

export const rewardEntrySchema = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  amount: z.number(),
  displayName: z.string().optional(),
});

export const rewardsResponseSchema = z.array(rewardEntrySchema);

export const latestRewardsResponseSchema = z.object({
  weekId: z.string().nullable(),
  poolTotal: z.number(),
  rewards: rewardsResponseSchema,
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type TopLeaderboardResponse = z.infer<typeof topLeaderboardResponseSchema>;
export type MeLeaderboardResponse = z.infer<typeof meLeaderboardResponseSchema>;
export type PoolResponse = z.infer<typeof poolResponseSchema>;
export type WeekCurrentResponse = z.infer<typeof weekCurrentResponseSchema>;
export type RewardEntry = z.infer<typeof rewardEntrySchema>;
export type RewardsResponse = z.infer<typeof rewardsResponseSchema>;
export type LatestRewardsResponse = z.infer<typeof latestRewardsResponseSchema>;

export const scoreIngestEventSchema = z.object({
  userId: z.string().min(1).max(128),
  amount: z.number().positive().finite(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const scoreIngestRequestSchema = scoreIngestEventSchema;

export const scoreIngestBatchRequestSchema = z.object({
  events: z.array(scoreIngestEventSchema).min(1).max(100),
});

export const scoreIngestResponseSchema = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean().optional(),
  weekId: z.string(),
  userId: z.string(),
  amount: z.number(),
  poolContribution: z.number(),
  score: z.number(),
});

export const scoreIngestBatchResponseSchema = z.object({
  weekId: z.string(),
  accepted: z.number(),
  duplicates: z.number(),
  results: z.array(scoreIngestResponseSchema),
});

export type ScoreIngestEvent = z.infer<typeof scoreIngestEventSchema>;
export type ScoreIngestResponse = z.infer<typeof scoreIngestResponseSchema>;
