import type { FastifyInstance, FastifyRequest } from 'fastify';
import { scoreIngestBatchRequestSchema, scoreIngestRequestSchema } from '@panteon/shared';
import { verifyInternalApiKey } from './internal-auth';
import { scoreIngestService } from './score-ingest.service';

async function preInternal(request: FastifyRequest): Promise<void> {
  verifyInternalApiKey(request);
}

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/internal/scores',
    {
      preHandler: preInternal,
      schema: {
        tags: ['Internal'],
        summary: 'Record player earnings (game server only)',
        description:
          'Increments weekly Redis score, adds 2% to prize pool, invalidates top-100 cache, publishes rank_update. Requires X-Internal-Api-Key.',
      },
    },
    async (request, reply) => {
      const body = scoreIngestRequestSchema.parse(request.body);
      const result = await scoreIngestService.ingestOne(body);
      return reply.status(result.duplicate ? 200 : 201).send(result);
    },
  );

  app.post(
    '/api/internal/scores/batch',
    {
      preHandler: preInternal,
      schema: {
        tags: ['Internal'],
        summary: 'Batch score ingest (up to 100 events)',
      },
    },
    async (request, reply) => {
      const { events } = scoreIngestBatchRequestSchema.parse(request.body);
      const result = await scoreIngestService.ingestBatch(events);
      return reply.status(201).send(result);
    },
  );
}
