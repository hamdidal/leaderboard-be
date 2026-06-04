import { env } from './env';

/** Strip trailing slashes so env typos do not break @fastify/cors matching. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function getAllowedCorsOrigins(): string[] {
  return env.CORS_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean);
}

export function isOriginAllowed(requestOrigin: string | undefined): boolean {
  if (!requestOrigin) return true;
  const allowed = getAllowedCorsOrigins();
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeOrigin(requestOrigin));
}
