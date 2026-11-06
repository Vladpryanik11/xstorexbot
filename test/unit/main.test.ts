import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('src/main.ts', () => {
  it('без настроек выходит с кодом 1 и называет переменные без значений', () => {
    const empty = join(mkdtempSync(join(tmpdir(), 'xbot-')), 'empty.env');
    writeFileSync(empty, '');
    const env = { ...process.env, BOT_TOKEN: '123456:SECRET_TOKEN_VALUE_SHOULD_NOT_LEAK_1234' };
    for (const key of Object.keys(env)) {
      if (
        key !== 'BOT_TOKEN' &&
        /^(BOT_|DATABASE_|ADMIN_|OWNER_|ORDERS_|CHANNEL_|CATALOG_|REVIEWS_|SUPPORT_|OFFER_|UDID_|PLATEGA_|CERT_|BACKUP_|CONTENT_)/.test(
          key,
        )
      ) {
        delete (env as Record<string, string | undefined>)[key];
      }
    }
    const result = spawnSync(
      process.execPath,
      [`--env-file=${empty}`, '--import', 'tsx', 'src/main.ts'],
      { env, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Неверные или пустые настройки в .env:');
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stderr + result.stdout).not.toContain('SECRET_TOKEN_VALUE');
  }, 30_000);
});
