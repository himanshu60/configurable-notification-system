import { Router } from 'express';
import { isDatabaseReady } from '../../db/mongoose.js';

export const healthRouter: Router = Router();

const startedAt = Date.now();

/**
 * Service index. Without this a bare `/` returns a 404, which reads as a broken
 * deployment to anyone who opens the URL and fills the log with red lines when
 * a platform health check probes the root.
 */
healthRouter.get('/', (_req, res) => {
  res.json({
    service: 'Configurable Notification System API',
    status: 'ok',
    version: 'v1',
    docs: 'https://github.com/himanshu60/configurable-notification-system#api-reference',
    endpoints: {
      health: '/health',
      readiness: '/health/ready',
      api: '/api/v1',
    },
  });
});

/** Liveness: the process is up. Deliberately does not touch dependencies. */
healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: safe to route traffic here. Fails while MongoDB is unreachable. */
healthRouter.get('/health/ready', (_req, res) => {
  const database = isDatabaseReady();
  res.status(database ? 200 : 503).json({
    status: database ? 'ready' : 'not-ready',
    checks: { database: database ? 'up' : 'down' },
    timestamp: new Date().toISOString(),
  });
});
