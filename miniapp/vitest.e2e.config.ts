import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    retry: 0,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/e2e.json' },
  },
})
