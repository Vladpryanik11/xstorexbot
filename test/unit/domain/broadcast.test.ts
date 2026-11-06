import { GrammyError, HttpError } from 'grammy';
import type { Message } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import type { BroadcastSummary } from '../../../src/broadcast/types.js';
import {
  classifySendError,
  isBroadcastable,
  progressText,
  reportText,
} from '../../../src/domain/broadcast.js';

const base = { id: 1, total: 100, createdAt: new Date(0), finishedAt: null };
const summary = (s: Partial<BroadcastSummary>): BroadcastSummary => ({
  ...base,
  status: 'DONE',
  sent: 0,
  blocked: 0,
  failed: 0,
  pending: 0,
  ...s,
});

const msg = (extra: Record<string, unknown>) =>
  ({ message_id: 1, date: 0, chat: { id: 1, type: 'private' }, ...extra }) as unknown as Message;

describe('isBroadcastable', () => {
  it.each([
    ['text', { text: 'hi' }, true],
    ['photo', { photo: [{}] }, true],
    ['video', { video: {} }, true],
    ['animation', { animation: {}, document: {} }, true],
    ['document', { document: {} }, true],
    ['audio', { audio: {} }, true],
    ['voice', { voice: {} }, true],
    ['sticker', { sticker: {} }, false],
    ['poll', { poll: {} }, false],
    ['contact', { contact: {} }, false],
    ['video_note', { video_note: {} }, false],
    ['album photo', { photo: [{}], media_group_id: 'g1' }, false],
    ['album video', { video: {}, media_group_id: 'g1' }, false],
  ])('%s -> %s', (_name, extra, expected) => {
    expect(isBroadcastable(msg(extra))).toBe(expected);
  });
});

describe('progressText', () => {
  it('shows processed of total', () => {
    expect(progressText(640, 1180)).toBe('Рассылка: отправлено 640 из 1180');
  });
});

describe('reportText', () => {
  it('DONE', () => {
    expect(reportText(summary({ status: 'DONE', sent: 1150, blocked: 25, failed: 5 }))).toBe(
      'Рассылка завершена.\nДоставлено: 1150\nЗаблокировали бота: 25\nОшибки: 5',
    );
  });
  it('STOPPED', () => {
    expect(
      reportText(summary({ status: 'STOPPED', sent: 10, blocked: 1, failed: 0, pending: 89 })),
    ).toBe(
      'Рассылка остановлена\nДоставлено: 10\nЗаблокировали бота: 1\nОшибки: 0\nНе отправлено: 89',
    );
  });
  it('FAILED', () => {
    expect(
      reportText(summary({ status: 'FAILED', sent: 3, blocked: 0, failed: 0, pending: 7 })),
    ).toBe(
      'Рассылка прервана: исходное сообщение удалено\nДоставлено: 3\nЗаблокировали бота: 0\nОшибки: 0\nНе отправлено: 7',
    );
  });
  it('RUNNING falls back to the progress line', () => {
    expect(
      reportText(summary({ status: 'RUNNING', sent: 4, blocked: 1, failed: 1, total: 20 })),
    ).toBe('Рассылка: отправлено 6 из 20');
  });
});

const grammy = (code: number, description: string, parameters?: { retry_after: number }) =>
  new GrammyError('x', { ok: false, error_code: code, description, parameters }, 'copyMessage', {});

describe('classifySendError', () => {
  it('403 -> blocked', () => {
    expect(classifySendError(grammy(403, 'Forbidden: bot was blocked by the user'))).toEqual({
      kind: 'blocked',
    });
  });
  it('429 -> retry after retry_after seconds', () => {
    expect(
      classifySendError(grammy(429, 'Too Many Requests: retry after 7', { retry_after: 7 })),
    ).toEqual({ kind: 'retry', afterMs: 7000 });
  });
  it('400 message to copy not found -> sourceGone', () => {
    expect(classifySendError(grammy(400, 'Bad Request: message to copy not found'))).toEqual({
      kind: 'sourceGone',
    });
  });
  it('other GrammyError -> failed with code and description', () => {
    expect(classifySendError(grammy(400, 'Bad Request: chat not found'))).toEqual({
      kind: 'failed',
      error: '400 Bad Request: chat not found',
    });
  });
  it('failed error is cut to 200 characters', () => {
    const r = classifySendError(grammy(400, 'x'.repeat(500)));
    expect(r.kind === 'failed' && r.error.length).toBe(200);
  });
  it('HttpError -> retry 5000', () => {
    expect(classifySendError(new HttpError('net', new Error('boom')))).toEqual({
      kind: 'retry',
      afterMs: 5000,
    });
  });
  it('rethrows unknown errors', () => {
    const e = new Error('bug');
    expect(() => classifySendError(e)).toThrow(e);
  });
});
