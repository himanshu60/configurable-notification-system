import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, syncIndexes } from '../../src/db/mongoose.js';

/**
 * Integration tests run against a real MongoDB - the same engine production
 * uses - rather than an in-memory substitute.
 *
 * That matters here more than usual: the idempotency and deduplication
 * guarantees are enforced by unique indexes and by the atomicity of
 * `findOneAndUpdate`. A fake would let those tests pass without proving
 * anything. `TEST_MONGODB_URI` points at a throwaway database that is dropped
 * between runs, so it never touches development data.
 */
const TEST_URI =
  process.env['TEST_MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/cns-test';

export const startTestDatabase = async (): Promise<void> => {
  await connectDatabase(TEST_URI);
  await mongoose.connection.dropDatabase();
  await syncIndexes();
};

export const stopTestDatabase = async (): Promise<void> => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
};

export const clearDatabase = async (): Promise<void> => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};
