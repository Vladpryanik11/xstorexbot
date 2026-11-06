import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
          globalSetup: ['test/int/global-setup.ts'],
          fileParallelism: false,
        },
      },
    ],
  },
});
