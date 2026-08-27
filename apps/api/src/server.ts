import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/logger.js';
import { connectDatabase, disconnectDatabase, syncIndexes } from './db/mongoose.js';
import { DeliveryDispatcher } from './worker/dispatcher.js';

const SHUTDOWN_GRACE_MS = 10_000;

const start = async (): Promise<void> => {
  await connectDatabase();
  await syncIndexes();

  // Runs in-process for a single-command demo. Setting WORKER_ENABLED=false and
  // starting a second process with it true is all that separating them takes.
  const dispatcher = env.workerEnabled ? new DeliveryDispatcher() : null;
  dispatcher?.start();

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, worker: env.workerEnabled },
      'Notification API listening',
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    // Hard stop if a connection refuses to drain, so the orchestrator is not
    // left waiting on a hung process.
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    timer.unref();

    server.close(async () => {
      try {
        // Stop claiming new work, then let the in-flight delivery finish so it
        // is not left stranded in PROCESSING for the visibility timeout.
        await dispatcher?.stop();
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Shutdown failed');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception, exiting');
    process.exit(1);
  });
};

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start the API');
  process.exit(1);
});
