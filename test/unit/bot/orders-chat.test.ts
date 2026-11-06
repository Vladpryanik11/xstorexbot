import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { createOrdersChat } from '../../../src/bot/orders-chat.js';

const MINUTE = 60_000;

function setup(send: (text: string) => Promise<unknown>) {
  const now = { value: new Date('2026-11-06T12:00:00Z') };
  const lines: string[] = [];
  const logger = pino(
    { level: 'info' },
    new Writable({
      write(chunk, _e, cb) {
        lines.push(chunk.toString());
        cb();
      },
    }),
  );
  const chat = createOrdersChat({ send, clock: () => now.value, logger });
  return { chat, now, lines };
}

describe('createOrdersChat', () => {
  it('первое сообщение отправляется', async () => {
    const sent: string[] = [];
    const { chat } = setup(async (t) => sent.push(t));
    await chat.notifyError('k', 'текст');
    expect(sent).toEqual(['текст']);
  });

  it('повтор с тем же ключом: через 9 минут молчит, через 10 отправляет', async () => {
    const sent: string[] = [];
    const { chat, now } = setup(async (t) => sent.push(t));
    await chat.notifyError('k', 'раз');
    now.value = new Date(now.value.getTime() + 9 * MINUTE);
    await chat.notifyError('k', 'два');
    expect(sent).toEqual(['раз']);
    now.value = new Date(now.value.getTime() + 1 * MINUTE);
    await chat.notifyError('k', 'три');
    expect(sent).toEqual(['раз', 'три']);
  });

  it('другой ключ отправляется сразу', async () => {
    const sent: string[] = [];
    const { chat } = setup(async (t) => sent.push(t));
    await chat.notifyError('a', 'раз');
    await chat.notifyError('b', 'два');
    expect(sent).toEqual(['раз', 'два']);
  });

  it('ошибка отправки не пробрасывается и попадает в лог', async () => {
    const { chat, lines } = setup(async () => {
      throw new Error('нет сети');
    });
    await expect(chat.notifyError('k', 'текст')).resolves.toBeUndefined();
    expect(lines.join('')).toContain('нет сети');
  });
});
