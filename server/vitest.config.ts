/**
 * Vitest configuration for the BuildSheet API server.
 *
 * Runs in Node.js with V8 coverage.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        // TODO: tighten these post-hackathon
        branches: 20,
        functions: 30,
        lines: 30,
        statements: 30,
      },
    },
  },
});
