import { execFileSync } from 'node:child_process';

export default function setup(): void {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST не задан. Поднимите базу (pnpm db:up) и задайте, например, postgresql://bot:bot@127.0.0.1:5433/xstorexbot_test',
    );
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
