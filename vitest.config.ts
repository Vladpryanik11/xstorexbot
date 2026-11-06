import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Локально DATABASE_URL_TEST берём из .env, если он не задан в окружении (в CI он задан).
// Из файла читаем только эту переменную: остальные секреты в тесты не попадают.
if (!process.env.DATABASE_URL_TEST && existsSync('.env')) {
  const fromFile = parseEnv(readFileSync('.env', 'utf8')).DATABASE_URL_TEST;
  if (fromFile) process.env.DATABASE_URL_TEST = fromFile;
}

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
