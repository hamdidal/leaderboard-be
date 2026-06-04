import { config } from 'dotenv';
import { z } from 'zod';

import path from 'path';
config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string(),
    MONGODB_URI: z.string(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32),
    CRON_TIMEZONE: z.string().default('UTC'),
    WEEKLY_CRON: z.string().default('0 0 * * 1'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    INTERNAL_API_KEY: z.string().min(32).default('dev-internal-api-key-min-32-chars!!!'),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === 'production' &&
      data.INTERNAL_API_KEY === 'dev-internal-api-key-min-32-chars!!!'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set a strong INTERNAL_API_KEY in production',
        path: ['INTERNAL_API_KEY'],
      });
    }
  });

export const env = envSchema.parse(process.env);
