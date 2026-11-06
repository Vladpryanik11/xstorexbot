import type { Logger } from '../logger.js';

export type Clock = () => Date;

export interface OrdersChat {
  /** Не чаще одного раза в 10 минут на ключ. Ошибки отправки не пробрасывает. */
  notifyError(key: string, text: string): Promise<void>;
  /** Число запомненных ключей (для тестов). */
  size(): number;
}

const WINDOW_MS = 10 * 60 * 1000;

export function createOrdersChat(opts: {
  send: (text: string) => Promise<unknown>;
  clock: Clock;
  logger: Logger;
}): OrdersChat {
  const lastSent = new Map<string, number>();
  return {
    size: () => lastSent.size,
    async notifyError(key, text) {
      const now = opts.clock().getTime();
      for (const [k, t] of lastSent) {
        if (now - t >= WINDOW_MS) lastSent.delete(k);
      }
      const last = lastSent.get(key);
      if (last !== undefined && now - last < WINDOW_MS) return;
      lastSent.set(key, now);
      try {
        await opts.send(text);
      } catch (err) {
        opts.logger.error({ err }, 'не удалось отправить сообщение в чат заказов');
      }
    },
  };
}
