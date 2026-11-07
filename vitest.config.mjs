import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const normalizedRootDir = rootDir.replace(/\\/g, '/');

export default defineConfig({
  resolve: {
    alias: [
      { find: 'server-only', replacement: resolve(rootDir, 'tests/harness/server-only-noop.ts') },
      { find: /^@\/(.*)/, replacement: `${normalizedRootDir}/$1` },
    ],
  },
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts'],
  },
});
