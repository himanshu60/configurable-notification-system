import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The .env lives at the repo root so a single file configures the whole stack.
loadDotenv({ path: path.resolve(here, '../../../../.env'), quiet: true });
loadDotenv({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  CORS_ORIGINS: z.string().default('http://localhost:4200'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),

  WORKER_ENABLED: z.enum(['true', 'false']).default('true'),
  WORKER_ID: z.string().default('api-1'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(10),
  WORKER_VISIBILITY_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),

  DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(4),
  DELIVERY_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(2000),
  DELIVERY_BACKOFF_MAX_MS: z.coerce.number().int().min(1000).default(300_000),

  MOCK_EMAIL_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  MOCK_EMAIL_MIN_LATENCY_MS: z.coerce.number().int().min(0).default(50),
  MOCK_EMAIL_MAX_LATENCY_MS: z.coerce.number().int().min(0).default(250),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Fail loudly at boot rather than surfacing as a confusing runtime error later.
  console.error(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  workerEnabled: raw.WORKER_ENABLED === 'true',
} as const;

export type Env = typeof env;
