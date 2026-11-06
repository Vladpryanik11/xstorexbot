import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, secretValues } from '../../src/config.js';

const key = Buffer.alloc(32, 7).toString('base64');

const validEnv: Record<string, string> = {
  BOT_TOKEN: '123456:fake_token_fake_token_fake_token_aa',
  BOT_USERNAME: 'xstorex_test_bot',
  DATABASE_URL: 'postgresql://bot:fake@127.0.0.1:5433/xstorexbot',
  ADMIN_IDS: '111, 222',
  OWNER_ID: '111',
  ORDERS_CHAT_ID: '-1009999999999',
  CHANNEL_ID: '-1001234567890',
  CHANNEL_INVITE_LINK: 'https://t.me/+fakeinvite',
  CATALOG_URL: 'https://example.com/catalog',
  REVIEWS_URL: 'https://example.com/reviews',
  SUPPORT_URL: 'https://example.com/support',
  OFFER_URL: 'https://example.com/offer',
  UDID_HELP_URL: 'https://example.com/udid',
  PLATEGA_MERCHANT_ID: '123e4567-e89b-12d3-a456-426614174000',
  PLATEGA_SECRET: 'fake-platega-secret',
  CERT_ENCRYPTION_KEY: key,
  BACKUP_PASSPHRASE: 'fake-passphrase-0123456789',
};

function failure(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected ConfigError');
}

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const c = loadConfig(validEnv);
    expect(c.adminIds).toEqual([111, 222]);
    expect(c.channelId).toBe(-1001234567890);
    expect(c.ownerId).toBe(111);
    expect(c.certEncryptionKey.length).toBe(32);
    expect(c.contentDir).toBe('./content');
    expect(c.links.udidHelp).toBe('https://example.com/udid');
    expect(c.platega.merchantId).toBe(validEnv.PLATEGA_MERCHANT_ID);
  });

  it('uses CONTENT_DIR when set', () => {
    expect(loadConfig({ ...validEnv, CONTENT_DIR: '/data/content' }).contentDir).toBe(
      '/data/content',
    );
  });

  it('falls back to ./content when CONTENT_DIR is empty', () => {
    expect(loadConfig({ ...validEnv, CONTENT_DIR: '' }).contentDir).toBe('./content');
  });

  it('accepts a merchant id without RFC version bits', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    expect(loadConfig({ ...validEnv, PLATEGA_MERCHANT_ID: id }).platega.merchantId).toBe(id);
  });

  it('names invalid variables alphabetically', () => {
    const { BOT_TOKEN: _omit, ...rest } = validEnv;
    const err = failure({ ...rest, ADMIN_IDS: 'abc' });
    expect(err.variables).toEqual(['ADMIN_IDS', 'BOT_TOKEN']);
    expect(err.message.startsWith('Неверные или пустые настройки в .env:')).toBe(true);
  });

  it('does not leak values into the message', () => {
    const err = failure({
      ...validEnv,
      PLATEGA_SECRET: 'super-secret-value',
      PLATEGA_MERCHANT_ID: 'not-a-uuid',
    });
    expect(err.variables).toEqual(['PLATEGA_MERCHANT_ID']);
    expect(err.message).not.toContain('super-secret-value');
    expect(err.message).not.toContain('not-a-uuid');
  });

  it.each([
    ['CERT_ENCRYPTION_KEY', Buffer.alloc(16).toString('base64')],
    ['CERT_ENCRYPTION_KEY', '!!!'],
    ['CATALOG_URL', 'http://example.com'],
    ['UDID_HELP_URL', 'ftp://example.com'],
    ['CHANNEL_INVITE_LINK', 'https://example.com/x'],
    ['BACKUP_PASSPHRASE', 'short'],
    ['BOT_USERNAME', 'abc'],
    ['BOT_USERNAME', 'bad-name-with-dash'],
    ['PLATEGA_MERCHANT_ID', 'nope'],
  ])('rejects invalid %s', (name, value) => {
    expect(failure({ ...validEnv, [name]: value }).variables).toEqual([name]);
  });
});

describe('secretValues', () => {
  it('includes the raw key text even when it differs from canonical base64', () => {
    const unpadded = key.replace(/=+$/, '');
    expect(unpadded).not.toBe(key);
    const values = secretValues(loadConfig({ ...validEnv, CERT_ENCRYPTION_KEY: unpadded }));
    expect(values).toContain(unpadded);
    expect(values).toContain(key);
  });

  it('lists token, platega secret, key in base64 and passphrase', () => {
    expect(secretValues(loadConfig(validEnv))).toEqual([
      validEnv.BOT_TOKEN,
      validEnv.PLATEGA_SECRET,
      key,
      validEnv.BACKUP_PASSPHRASE,
      validEnv.PLATEGA_MERCHANT_ID,
    ]);
  });
});

describe('secretValues: Platega и пароль БД', () => {
  it('включает merchantId', () => {
    expect(secretValues(loadConfig(validEnv))).toContain(validEnv.PLATEGA_MERCHANT_ID);
  });

  it('включает длинный пароль БД в обычном и декодированном виде', () => {
    const url = 'postgresql://bot:p%40ss%2Fword-123@127.0.0.1:5433/db';
    const values = secretValues(loadConfig({ ...validEnv, DATABASE_URL: url }));
    expect(values).toContain('p%40ss%2Fword-123');
    expect(values).toContain('p@ss/word-123');
  });

  it('короткий пароль (меньше 8 символов) не включается', () => {
    const url = 'postgresql://bot:bot@127.0.0.1:5433/db';
    expect(secretValues(loadConfig({ ...validEnv, DATABASE_URL: url }))).not.toContain('bot');
  });

  it('невалидный DATABASE_URL не роняет secretValues', () => {
    expect(() =>
      secretValues(loadConfig({ ...validEnv, DATABASE_URL: 'not a url' })),
    ).not.toThrow();
  });
});
