import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The layout search takes several seconds per acceptance case.
    testTimeout: 120_000,
  },
});
