import { Router } from 'express';
import { isDatabaseReady } from '../../db/mongoose.js';

export const healthRouter: Router = Router();

const startedAt = Date.now();

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
