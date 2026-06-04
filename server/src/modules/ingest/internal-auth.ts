import type { FastifyRequest } from 'fastify';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

const HEADER = 'x-internal-api-key';

export function verifyInternalApiKey(request: FastifyRequest): void {
  const provided =
    (request.headers[HEADER] as string | undefined) ??
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : undefined);

  if (!provided || provided !== env.INTERNAL_API_KEY) {
    throw new AppError('Unauthorized internal request', 401);
  }
}
