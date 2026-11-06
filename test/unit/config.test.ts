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
  it('lists token, platega secret, key in base64 and passphrase', () => {
    expect(secretValues(loadConfig(validEnv))).toEqual([
      validEnv.BOT_TOKEN,
      validEnv.PLATEGA_SECRET,
      key,
      validEnv.BACKUP_PASSPHRASE,
    ]);
  });
});
