import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Integration suites share one MongoDB, so they must not run concurrently:
    // parallel files would clear each other's fixtures mid-test.
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**', 'src/worker/**', 'src/modules/**'],
      exclude: ['src/**/*.routes.ts', 'src/seed.ts'],
    },
  },
});
