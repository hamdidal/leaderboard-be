import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { getAllowedCorsOrigins, isOriginAllowed } from './config/cors';
import { env } from './config/env';
import { AppError } from './lib/errors';
import { registerAuth } from './modules/auth/auth.plugin';
import { ingestRoutes } from './modules/ingest/ingest.routes';
import { leaderboardRoutes } from './modules/leaderboard/leaderboard.controller';
import { registerWebSocket } from './realtime/ws.handler';

export async function buildApp() {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });

  await app.register(cors, {
    origin:
      env.NODE_ENV === 'production'
        ? (origin, callback) => {
            if (isOriginAllowed(origin)) {
              callback(null, origin ?? true);
              return;
            }
            app.log.warn(
              { origin, allowed: getAllowedCorsOrigins() },
              'CORS request blocked — check CORS_ORIGINS on Railway',
            );
            callback(null, false);
          }
        : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Muscle Land Leaderboard API',
        description: 'Weekly leaderboard system for idle/clicker mobile game',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  await registerAuth(app);
  await registerWebSocket(app);
  await app.register(ingestRoutes);
  await app.register(leaderboardRoutes);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: error.flatten(),
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error(error);
    }

    reply.status(statusCode).send({
      error: (error as Error).message ?? 'Internal Server Error',
    });
  });

  return app;
}
