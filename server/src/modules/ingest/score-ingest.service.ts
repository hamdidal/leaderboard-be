import { WeekStatus } from '@prisma/client';
import {
  scoreIngestEventSchema,
  type ScoreIngestEvent,
  type ScoreIngestResponse,
} from '@panteon/shared';
import { prisma } from '../../config/prisma';
import { getMongoDb } from '../../config/mongo';
import { redis } from '../../config/redis';
import { AppError } from '../../lib/errors';
import { POOL_CONTRIBUTION_RATE, RedisKeys } from '../../lib/redis-keys';
import { publishLeaderboardLive } from '../../realtime/publish';
import { leaderboardRepo } from '../leaderboard/leaderboard.repo';

const IDEMPOTENCY_TTL_SEC = 7 * 24 * 60 * 60;

export function poolContributionForAmount(amount: number): number {
  return Math.round(amount * POOL_CONTRIBUTION_RATE * 100) / 100;
}

function idempotencyRedisKey(key: string): string {
  return `idem:earn:${key}`;
}

async function assertWeekAcceptsScores(weekId: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (week && week.status !== WeekStatus.ACTIVE) {
    throw new AppError(`Week ${weekId} is not accepting scores (${week.status})`, 409);
  }
}

function recordEarnAudit(weekId: string, event: ScoreIngestEvent, poolContribution: number): void {
  setImmediate(() => {
    let db;
    try {
      db = getMongoDb();
    } catch {
      return;
    }
    void db
      .collection('earn_events')
      .insertOne({
        weekId,
        userId: event.userId,
        amount: event.amount,
        poolContribution,
        ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
        createdAt: new Date(),
      })
      .catch(() => undefined);
  });
}

export class ScoreIngestService {
  async ingestOne(event: ScoreIngestEvent): Promise<ScoreIngestResponse> {
    const parsed = scoreIngestEventSchema.parse(event);
    const weekId = await leaderboardRepo.getCurrentWeekId();
    await assertWeekAcceptsScores(weekId);

    if (parsed.idempotencyKey) {
      const claimed = await redis.set(
        idempotencyRedisKey(parsed.idempotencyKey),
        weekId,
        'EX',
        IDEMPOTENCY_TTL_SEC,
        'NX',
      );
      if (claimed !== 'OK') {
        const score = await this.getScore(weekId, parsed.userId);
        return {
          accepted: false,
          duplicate: true,
          weekId,
          userId: parsed.userId,
          amount: parsed.amount,
          poolContribution: poolContributionForAmount(parsed.amount),
          score,
        };
      }
    }

    const poolContribution = poolContributionForAmount(parsed.amount);
    const lbKey = RedisKeys.weekLeaderboard(weekId);
    const poolKey = RedisKeys.weekPool(weekId);

    const pipeline = redis.pipeline();
    pipeline.zincrby(lbKey, parsed.amount, parsed.userId);
    pipeline.incrbyfloat(poolKey, poolContribution);
    pipeline.del(RedisKeys.top100Cache(weekId));
    await pipeline.exec();

    await publishLeaderboardLive(weekId, {
      type: 'rank_update',
      userId: parsed.userId,
    });

    recordEarnAudit(weekId, parsed, poolContribution);

    const score = await this.getScore(weekId, parsed.userId);

    return {
      accepted: true,
      weekId,
      userId: parsed.userId,
      amount: parsed.amount,
      poolContribution,
      score,
    };
  }

  async ingestBatch(events: ScoreIngestEvent[]): Promise<{
    weekId: string;
    accepted: number;
    duplicates: number;
    results: ScoreIngestResponse[];
  }> {
    const results: ScoreIngestResponse[] = [];
    let accepted = 0;
    let duplicates = 0;

    for (const event of events) {
      const result = await this.ingestOne(event);
      results.push(result);
      if (result.duplicate) duplicates += 1;
      else if (result.accepted) accepted += 1;
    }

    const weekId = await leaderboardRepo.getCurrentWeekId();
    return { weekId, accepted, duplicates, results };
  }

  private async getScore(weekId: string, userId: string): Promise<number> {
    const raw = await redis.zscore(RedisKeys.weekLeaderboard(weekId), userId);
    return raw ? parseFloat(raw) : 0;
  }
}

export const scoreIngestService = new ScoreIngestService();
