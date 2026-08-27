/**
 * Loaded before any test module. The env vars have to be in place before
 * `config/env.ts` is imported anywhere in the graph, which is why this runs as
 * a setup file rather than inside a `beforeAll`.
 */
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] ??= 'test-secret-that-is-definitely-long-enough-32';
process.env['MONGODB_URI'] ??= 'mongodb://127.0.0.1:27017/cns-test';
process.env['LOG_LEVEL'] = 'silent';
process.env['WORKER_ENABLED'] = 'false';
process.env['BCRYPT_ROUNDS'] = '4';
process.env['MOCK_EMAIL_FAILURE_RATE'] = '0';
process.env['MOCK_EMAIL_MIN_LATENCY_MS'] = '0';
process.env['MOCK_EMAIL_MAX_LATENCY_MS'] = '0';
