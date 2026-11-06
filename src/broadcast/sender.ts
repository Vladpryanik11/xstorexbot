import { type Api, InlineKeyboard } from 'grammy';
import { cb } from '../bot/callback-data.js';
import { classifySendError, progressText, reportText } from '../domain/broadcast.js';
import type { Logger } from '../logger.js';
import { texts } from '../texts.js';
import type { BroadcastStore } from './store.js';
import type { BroadcastButton, Broadcasts } from './types.js';

export type SenderApi = Pick<Api, 'copyMessage' | 'sendMessage' | 'editMessageText'>;

const BATCH_SIZE = 100;
/** Telegram не принимает 429 с нулевой паузой: меньше секунды ждать нельзя. */
const MIN_RETRY_MS = 1000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function stopKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard().text(texts.admin.broadcastStopButton, cb.admin(`bc:stop:${id}`));
}

function buttonMarkup(button: BroadcastButton | null): InlineKeyboard | undefined {
  return button ? new InlineKeyboard().url(button.text, button.url) : undefined;
}

export function createBroadcasts(opts: {
  store: BroadcastStore;
  api: () => SenderApi;
  clock: () => Date;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
  ratePerSecond?: number;
  progressIntervalMs?: number;
}): Broadcasts {
  const { store, clock, logger } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const pauseMs = 1000 / (opts.ratePerSecond ?? 25);
  const progressIntervalMs = opts.progressIntervalMs ?? 5000;

  const stopRequested = new Set<number>();
  let shuttingDown = false;
  let loop: Promise<void> = Promise.resolve();
  let loopBroadcastId: number | null = null;

  /** Только код и описание: сырое исключение (HttpError) может содержать URL с токеном. */
  function logFailure(message: string, err: unknown): void {
    const safe =
      err instanceof Error ? { name: err.name, message: err.message } : { type: typeof err };
    logger.error({ broadcast: safe }, message);
  }

  async function updateProgress(
    adminId: number,
    messageId: number | null,
    id: number,
    final: boolean,
  ): Promise<void> {
    if (messageId === null) return;
    try {
      const s = await store.summary(id);
      await opts
        .api()
        .editMessageText(
          adminId,
          messageId,
          progressText(s.sent + s.blocked + s.failed, s.total),
          final ? undefined : { reply_markup: stopKeyboard(id) },
        );
    } catch {
      // Правка прогресса не критична: «message is not modified», удалённое сообщение и т.п.
    }
  }

  async function sendAll(
    b: NonNullable<Awaited<ReturnType<BroadcastStore['get']>>>,
  ): Promise<void> {
    const markup = buttonMarkup(b.button);
    let lastEditAt = clock().getTime();

    while (!stopRequested.has(b.id) && !shuttingDown) {
      const batch = await store.pending(b.id, BATCH_SIZE);
      if (batch.length === 0) break;

      for (const userId of batch) {
        let handled = false;
        while (!handled) {
          if (stopRequested.has(b.id) || shuttingDown) return;
          try {
            await opts
              .api()
              .copyMessage(
                userId,
                b.sourceChatId,
                b.sourceMessageId,
                markup ? { reply_markup: markup } : undefined,
              );
            await store.markSent(b.id, userId, clock());
            handled = true;
          } catch (err) {
            const result = classifySendError(err);
            if (result.kind === 'blocked') {
              await store.markBlocked(b.id, userId, clock());
              handled = true;
            } else if (result.kind === 'retry') {
              await sleep(Math.max(result.afterMs, MIN_RETRY_MS));
            } else if (result.kind === 'sourceGone') {
              await store.finish(b.id, 'FAILED', clock());
              return;
            } else {
              await store.markFailed(b.id, userId, result.error);
              handled = true;
            }
          }
        }
        await sleep(pauseMs);

        if (clock().getTime() - lastEditAt >= progressIntervalMs) {
          lastEditAt = clock().getTime();
          await updateProgress(b.adminId, b.progressMessageId, b.id, false);
        }
      }
    }
    if (!stopRequested.has(b.id) && !shuttingDown) await store.finish(b.id, 'DONE', clock());
  }

  /** Финальная правка прогресса без кнопки и отчёт новым сообщением; сбой отчёта не критичен. */
  async function finalize(
    adminId: number,
    progressMessageId: number | null,
    id: number,
  ): Promise<void> {
    try {
      await updateProgress(adminId, progressMessageId, id, true);
      await opts.api().sendMessage(adminId, reportText(await store.summary(id)));
    } catch (err) {
      logFailure('broadcast report failed', err);
    }
  }

  /** Без деталей ошибки: текст фиксированный; сбой уведомления только логируется. */
  async function notifyPaused(id: number): Promise<void> {
    try {
      const b = await store.get(id);
      if (b) await opts.api().sendMessage(b.adminId, texts.admin.broadcastPaused);
    } catch (err) {
      logFailure('broadcast pause notice failed', err);
    }
  }

  async function runLoop(id: number): Promise<void> {
    try {
      const b = await store.get(id);
      if (b?.status !== 'RUNNING') return;
      await sendAll(b);
      // Остановка процесса: статус остаётся RUNNING, отчёт придёт после возобновления.
      // Если до этого нажали «Остановить», отчёт об остановке всё равно отправляем.
      if (shuttingDown && !stopRequested.has(id)) return;
      // Отчёт и после остановки, и после прерывания, и после обычного конца.
      await finalize(b.adminId, b.progressMessageId, id);
    } catch (err) {
      // Рассылка остаётся RUNNING и продолжится после перезапуска (resume).
      logFailure('broadcast loop aborted', err);
      await notifyPaused(id);
    } finally {
      stopRequested.delete(id);
      // Состояние могло уже перейти к более новой рассылке.
      if (loopBroadcastId === id) loopBroadcastId = null;
    }
  }

  function launch(id: number): void {
    loopBroadcastId = id;
    loop = runLoop(id);
  }

  return {
    countRecipients: () => store.countRecipients(),
    current: () => store.latest(),

    async start(input) {
      const created = await store.create(input, clock());
      if (!created.ok) return created;
      try {
        const msg = await opts.api().sendMessage(input.adminId, progressText(0, created.total), {
          reply_markup: stopKeyboard(created.id),
        });
        await store.setProgressMessage(created.id, msg.message_id);
      } catch (err) {
        logFailure('broadcast progress message failed', err);
      }
      launch(created.id);
      return created;
    },

    async stop(adminId, broadcastId) {
      // Решение о цикле принимается до await: цикл мог закончиться, пока store.stop в пути.
      const local = loopBroadcastId === broadcastId;
      if (local) stopRequested.add(broadcastId);
      const stopped = await store.stop(adminId, broadcastId, clock());
      if (!stopped) {
        if (local) stopRequested.delete(broadcastId);
        return false;
      }
      if (local) return true;
      // Цикла в этом процессе нет (прервался или ещё не возобновлён): отчёт отправляем сами.
      const b = await store.get(broadcastId);
      if (b) await finalize(b.adminId, b.progressMessageId, broadcastId);
      return true;
    },

    async resume() {
      if (loopBroadcastId !== null) return;
      const id = await store.running();
      if (id !== null) launch(id);
    },

    shutdown() {
      shuttingDown = true;
    },

    idle: () => loop,
  };
}
