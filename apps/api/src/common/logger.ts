import pino from 'pino';
import { env } from '../config/env.js';

const prettyTransport =
  env.isProduction || env.isTest
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      };

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  ...(prettyTransport ? { transport: prettyTransport } : {}),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
    censor: '[redacted]',
  },
});

/** Child logger for a subsystem, e.g. `createLogger('worker')`. */
export const createLogger = (component: string) => logger.child({ component });
