import type { FastifyInstance, FastifyRequest } from 'fastify';
import fjwt from '@fastify/jwt';
import { env } from '../../config/env';

export interface JwtPayload {
  sub: string;
  displayName?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fjwt, { secret: env.JWT_SECRET });

  app.decorate('authenticate', async (request: FastifyRequest) => {
    await request.jwtVerify();
  });
}

export function getUserId(request: FastifyRequest): string {
  const payload = request.user as JwtPayload;
  return payload.sub;
}
