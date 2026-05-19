import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    postcss: {}
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      all: false,
      thresholds: { lines: 60, functions: 60 }
    }
  }
});
