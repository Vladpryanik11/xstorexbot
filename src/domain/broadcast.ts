import { GrammyError, HttpError } from 'grammy';
import type { Message } from 'grammy/types';
import type { BroadcastSummary } from '../broadcast/types.js';
import { texts } from '../texts.js';

/** Можно ли скопировать сообщение подписчикам: одиночное, не стикер/опрос/контакт/кружок. */
export function isBroadcastable(msg: Message): boolean {
  if (msg.media_group_id !== undefined) return false;
  return (
    msg.text !== undefined ||
    msg.photo !== undefined ||
    msg.video !== undefined ||
    msg.animation !== undefined ||
    msg.document !== undefined ||
    msg.audio !== undefined ||
    msg.voice !== undefined
  );
}

/** `sent` — обработанные получатели (SENT + BLOCKED + FAILED). */
export function progressText(sent: number, total: number): string {
  return texts.admin.broadcastProgress(sent, total);
}

export function reportText(s: BroadcastSummary): string {
  if (s.status === 'RUNNING') return progressText(s.sent + s.blocked + s.failed, s.total);
  const a = texts.admin;
  const lines = [
    a.broadcastTitles[s.status],
    a.broadcastDelivered(s.sent),
    a.broadcastBlocked(s.blocked),
    a.broadcastErrors(s.failed),
  ];
  if (s.status !== 'DONE') lines.push(a.broadcastPending(s.pending));
  return lines.join('\n');
}

export type SendErrorKind =
  | { kind: 'blocked' }
  | { kind: 'retry'; afterMs: number }
  | { kind: 'sourceGone' }
  | { kind: 'failed'; error: string };

const MAX_ERROR_LENGTH = 200;
const NETWORK_RETRY_MS = 5000;

/** Только код и описание Telegram: URL запроса (с токеном) в ошибку не попадает. */
export function classifySendError(err: unknown): SendErrorKind {
  if (err instanceof GrammyError) {
    if (err.error_code === 403) return { kind: 'blocked' };
    if (err.error_code === 429) {
      return { kind: 'retry', afterMs: (err.parameters.retry_after ?? 0) * 1000 };
    }
    if (err.error_code === 400 && err.description.includes('message to copy not found')) {
      return { kind: 'sourceGone' };
    }
    return {
      kind: 'failed',
      error: `${err.error_code} ${err.description}`.slice(0, MAX_ERROR_LENGTH),
    };
  }
  if (err instanceof HttpError) return { kind: 'retry', afterMs: NETWORK_RETRY_MS };
  throw err;
}
