import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';

function redisOptions(url: string): RedisOptions {
  const options: RedisOptions = { maxRetriesPerRequest: null };
  if (url.startsWith('rediss://')) {
    options.tls = {};
  }
  return options;
}

const sharedOptions = redisOptions(env.REDIS_URL);

export const redis = new Redis(env.REDIS_URL, sharedOptions);

export const redisSubscriber = new Redis(env.REDIS_URL, sharedOptions);
