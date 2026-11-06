import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No integration tests exist until task 4; keep `pnpm test:int` green meanwhile.
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'int',
          include: ['test/int/**/*.test.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
