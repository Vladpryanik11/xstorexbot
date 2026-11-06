import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../int/helpers/guard.js';

describe('assertTestDatabase', () => {
  it('accepts a database whose name ends with _test', () => {
    expect(() =>
      assertTestDatabase('postgresql://bot:bot@127.0.0.1:5433/xstorexbot_test'),
    ).not.toThrow();
  });

  it('rejects other databases without leaking the URL', () => {
    const url = 'postgresql://bot:s3cretpass@127.0.0.1:5433/xstorexbot';
    try {
      assertTestDatabase(url);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('_test');
      expect(msg).not.toContain('s3cretpass');
    }
  });

  it('rejects an unparsable URL without leaking it', () => {
    expect(() => assertTestDatabase('not a url s3cret')).toThrow(/DATABASE_URL_TEST/);
    try {
      assertTestDatabase('not a url s3cret');
    } catch (e) {
      expect((e as Error).message).not.toContain('s3cret');
    }
  });
});
