import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportFatal } from '../../src/fatal.js';

describe('reportFatal', () => {
  afterEach(() => vi.restoreAllMocks());

  it('печатает только сообщение и скрывает токен и ключ шифрования', () => {
    const token = '123456:fake_token_fake_token_fake_token_aa';
    const certKey = Buffer.alloc(32, 7).toString('base64');
    const chunks: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as never);
    const err = new Error(`fetch failed for /bot${token}/getMe key=${certKey}`);
    reportFatal(err, [token, certKey]);
    const out = chunks.join('');
    expect(out).toContain('Ошибка запуска: ');
    expect(out).toContain('[скрыто]');
    expect(out).not.toContain(token);
    expect(out).not.toContain(certKey);
    expect(out).not.toContain('at ');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('не объект ошибки: приводит к строке', () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as never);
    reportFatal('boom', []);
    expect(chunks.join('')).toBe('Ошибка запуска: boom\n');
  });
});
