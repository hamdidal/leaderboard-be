import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env';
import { getUserId } from '../auth/auth.plugin';
import { leaderboardService } from './leaderboard.service';
import { leaderboardRepo } from './leaderboard.repo';
import { rewardsService } from '../rewards/rewards.service';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { getMongoDb } from '../../config/mongo';

export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/healthz',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness check',
        response: { 200: { type: 'object', properties: { status: { type: 'string' } } } },
      },
    },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/readyz',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check — verifies DB, Redis and Mongo connectivity',
      },
    },
    async (_request, reply) => {
      const checks: Record<string, 'ok' | 'error'> = {};
      let healthy = true;

      try {
        await prisma.$queryRaw`SELECT 1`;
        checks.postgres = 'ok';
      } catch {
        checks.postgres = 'error';
        healthy = false;
      }

      try {
        await redis.ping();
        checks.redis = 'ok';
      } catch {
        checks.redis = 'error';
        healthy = false;
      }

      try {
        const db = getMongoDb();
        await db.command({ ping: 1 });
        checks.mongo = 'ok';
      } catch {
        checks.mongo = 'error';
        healthy = false;
      }

      return reply
        .status(healthy ? 200 : 503)
        .send({ status: healthy ? 'ok' : 'degraded', checks });
    },
  );

  app.get('/api/leaderboard/top', async (_request, reply) => {
    const data = await leaderboardService.getTop100();
    return reply.send(data);
  });

  app.get('/api/leaderboard/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = getUserId(request);
    const data = await leaderboardService.getMe(userId);
    return reply.send(data);
  });

  app.get('/api/pool', async (_request, reply) => {
    const weekId = await leaderboardRepo.getCurrentWeekId();
    const poolTotal = await leaderboardRepo.getPoolTotal(weekId);
    return reply.send({ weekId, poolTotal });
  });

  app.get('/api/week/current', async (_request, reply) => {
    const data = await leaderboardService.getCurrentWeekMeta();
    return reply.send(data);
  });

  app.get('/api/rewards/latest', async (_request, reply) => {
    const data = await rewardsService.getLatestClosedRewards();
    if (!data) {
      return reply.send({ weekId: null, poolTotal: 0, rewards: [] });
    }
    return reply.send(data);
  });

  app.get('/api/rewards/:weekId', async (request, reply) => {
    const { weekId } = request.params as { weekId: string };
    const week = await prisma.week.findUnique({ where: { id: weekId } });
    const rewards = await rewardsService.getRewardsForWeek(weekId);
    const poolTotal = week ? Number(week.poolTotal) : rewards.reduce((sum, r) => sum + r.amount, 0);
    return reply.send({ weekId, poolTotal, rewards });
  });

  if (!env.DISABLE_DEMO_AUTH) {
    app.post(
      '/api/auth/demo-token',
      {
        config: {
          rateLimit:
            env.NODE_ENV === 'production'
              ? { max: 60, timeWindow: '1 minute' }
              : { max: 1000, timeWindow: '1 minute' },
        },
      },
      async (request, reply) => {
        const { userId } = (request.body as { userId?: string }) ?? {};
        if (!userId) {
          return reply.status(400).send({ error: 'userId required' });
        }
        const token = app.jwt.sign({ sub: userId }, { expiresIn: '7d' });
        return reply.send({ token });
      },
    );
  }

  app.post(
    '/api/admin/trigger-reset',
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { weekId } = (request.body as { weekId?: string }) ?? {};

      const targetWeekId = weekId ?? (await leaderboardRepo.getCurrentWeekId());

      const result = await rewardsService.distributeAndResetWeek(targetWeekId);

      if (!result.distributed && result.reason) {
        const alreadyDone =
          result.reason === 'Already processed' ||
          result.reason === 'Rewards already distributed for this week';
        return reply
          .status(alreadyDone ? 409 : 422)
          .send({ success: false, reason: result.reason });
      }

      return reply.send({ success: true, ...result });
    },
  );
}
