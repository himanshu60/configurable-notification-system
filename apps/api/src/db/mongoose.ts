import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('db');

mongoose.set('strictQuery', true);
// Building indexes automatically is convenient in development but a foot-gun on
// a large production collection, so it is opt-out via NODE_ENV.
mongoose.set('autoIndex', !env.isProduction);

export const connectDatabase = async (uri: string = env.MONGODB_URI): Promise<typeof mongoose> => {
  mongoose.connection.on('connected', () => log.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (error) => log.error({ err: error }, 'MongoDB error'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 2,
  });

  return mongoose;
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close(false);
};

export const isDatabaseReady = (): boolean => mongoose.connection.readyState === 1;

/**
 * Ensures every registered model's indexes exist. Called once at boot in
 * non-production so a fresh clone gets the unique constraints that the
 * idempotency and deduplication guarantees depend on.
 */
export const syncIndexes = async (): Promise<void> => {
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((model) => model.syncIndexes()));
  log.debug({ models: models.map((model) => model.modelName) }, 'Indexes synchronised');
};
