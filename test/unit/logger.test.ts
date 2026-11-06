import { Writable } from 'node:stream';
import { GrammyError, InputFile } from 'grammy';
import { describe, expect, it } from 'vitest';
import { createLogger, redactSecrets } from '../../src/logger.js';

describe('redactSecrets', () => {
  it('replaces every occurrence', () => {
    expect(redactSecrets('url /bot123:ABC/getMe', ['123:ABC'])).toBe('url /bot[скрыто]/getMe');
    expect(redactSecrets('a 123:ABC b 123:ABC', ['123:ABC'])).toBe('a [скрыто] b [скрыто]');
  });

  it('redacts the JSON-escaped form of a secret', () => {
    const secret = 'pa"ss\\word-0123456789';
    const line = JSON.stringify({ msg: `bad ${secret} here` });
    const out = redactSecrets(line, [secret]);
    expect(out).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(out).toContain('[скрыто]');
  });

  it('redacts longest secrets first so no fragment remains', () => {
    expect(redactSecrets('x abcdef y', ['abc', 'abcdef'])).toBe('x [скрыто] y');
  });

  it('ignores empty secrets', () => {
    expect(redactSecrets('plain text', ['', 'zzz'])).toBe('plain text');
  });
});

describe('createLogger', () => {
  it('never writes secrets', async () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger(['123:ABC'], destination);
    logger.error({ err: new Error('fail 123:ABC') }, 'x');
    await new Promise((r) => setImmediate(r));
    const out = chunks.join('');
    expect(out).not.toContain('123:ABC');
    expect(out).toContain('[скрыто]');
  });

  it('never writes a secret with quotes or backslashes, raw or escaped', async () => {
    const secret = 'pa"ss\\word-0123456789';
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger([secret], destination);
    logger.error({ err: new Error(`fail ${secret}`) }, 'x');
    await new Promise((r) => setImmediate(r));
    const out = chunks.join('');
    expect(out).not.toContain(secret);
    expect(out).not.toContain(JSON.stringify(secret).slice(1, -1));
    expect(out).toContain('[скрыто]');
  });

  it('GrammyError: пишет описание, без payload и без «unable to serialize»', async () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger([], destination);
    const err = new GrammyError(
      'Call to sendPhoto failed!',
      { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier' },
      'sendPhoto',
      { chat_id: 1, photo: new InputFile(Buffer.from([1, 2, 3]), 'start.jpg') },
    );
    logger.error({ err }, 'x');
    await new Promise((r) => setImmediate(r));
    const out = chunks.join('');
    expect(out).toContain('wrong file identifier');
    expect(out).not.toContain('payload');
    expect(out).not.toContain('unable to serialize');
  });
});
